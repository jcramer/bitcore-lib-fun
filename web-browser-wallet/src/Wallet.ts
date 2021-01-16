import { Big } from "big.js";
import * as bip32 from "bip32";
import * as bip39 from "bip39";
import { PrivateKey } from "bitcore-lib-cash";
import { GrpcClient, TokenMetadata, Transaction } from "grpc-bchrpc-web";
import { Component } from "react";

type tokenId = string;
type outpoint = string;

const addressPath = "m/44'/245'/0'/0/0";

export class Wallet {
  private parent?: Component;
  private mnemonic: string;
  private privateKey: PrivateKey;
  private networkUrl = "https://bchd.ny1.simpleledger.io";
  private loadingBalance = false;
  private bchTxi = new Map<outpoint, Big>();
  private bchTxo = new Map<outpoint, Big>();
  private slpTxi = new Map<tokenId, Map<outpoint, Big>>();
  private slpTxo = new Map<tokenId, Map<outpoint, Big>>();
  private tokenMetadata = new Map<tokenId, TokenMetadata>();

  constructor(parent?: Component) {
    // set private key
    this.parent = parent;
    this.mnemonic = bip39.generateMnemonic();
    let seed = bip32.fromSeed(bip39.mnemonicToSeedSync(this.Mnemonic));
    let child = seed.derivePath(addressPath);
    this.privateKey = new PrivateKey(child.toWIF());
    if (localStorage.getItem("bitcore-fun-seed") === null) {
      localStorage.setItem("bitcore-fun-seed", this.Mnemonic);
    } else {
      this.mnemonic = localStorage.getItem("bitcore-fun-seed")!;
      seed = bip32.fromSeed(bip39.mnemonicToSeedSync(this.Mnemonic));
      child = seed.derivePath(addressPath);
      this.privateKey = new PrivateKey(child.toWIF());
    }

    this.UpdateBalances(this.updateParent);
  }

  public get Mnemonic() {
    return this.mnemonic;
  }

  public get PrivateKey() {
    return this.privateKey.toWIF();
  }

  public set PrivateKey(_bip39: string) {
    if (! bip39.validateMnemonic(_bip39)) {
      throw Error("invalid mnemonic");
    }
    const seed = bip32.fromSeed(bip39.mnemonicToSeedSync(this.mnemonic));
    const child = seed.derivePath(addressPath);
    this.privateKey = new PrivateKey(child.toWIF());
    this.UpdateBalances(this.updateParent);
  }

  public get Address() { return this.privateKey.toAddress().toCashAddress(); }
  public get NetworkUrl() { return this.networkUrl; }
  public get BchCoins() { return this.bchTxi; }
  public get SlpCoins() { return this.slpTxi; }
  public get TokenMetadata() { return this.tokenMetadata; }

  public UpdateMnemonic(m: string) {
    if (! bip39.validateMnemonic(m)) {
      throw new Error("invalid mnemonic");
    }
    this.mnemonic = m;
    localStorage.setItem("bitcore-fun-seed", this.Mnemonic);
    const seed = bip32.fromSeed(bip39.mnemonicToSeedSync(this.Mnemonic));
    const child = seed.derivePath(addressPath);
    this.privateKey = new PrivateKey(child.toWIF());
    this.UpdateBalances(this.updateParent);
  }

  public GetBchBalance(): Big {
    const inputAmt = Array.from(this.bchTxi!).reduce((p, c) => p.add(c[1]), Big(0));
    return Array.from(this.bchTxo!).reduce((p, c) => p.add(c[1]), Big(0)).sub(inputAmt);
  }

  public GetSlpBalances(): Map<tokenId, Big> {
    const slpBals = new Map<tokenId, Big>();
    Array.from(this.slpTxi!).forEach((coins) => {
      slpBals.set(coins[0], Array.from(coins[1]).reduce((p, c) => p.add(c[1]), Big(0)));
    });
    Array.from(this.slpTxo!).forEach((coins) => {
      const bal = slpBals.get(coins[0])!;
      slpBals.set(coins[0], Array.from(coins[1]).reduce((p, c) => p.add(c[1]), Big(0)).sub(bal));
    });
    return slpBals;
  }

  public async UpdateBalances(callback?: () => any) {
    if (this.loadingBalance) {
      return;
    }
    this.loadingBalance = true;
    const client = new GrpcClient({ url: this.networkUrl });

    const slpEnabled = (await client.getBlockchainInfo()).getSlpIndex();
    if (! slpEnabled) {
      throw Error("connected bchd does not have slp index enabled");
    }

    const res = await client.getAddressTransactions({ address: this.Address });
    const tokenIds = new Set<string>();
    this.indexTransactionIO(res.getConfirmedTransactionsList(), tokenIds);
    this.indexTransactionIO(res.getUnconfirmedTransactionsList()!.map(o => o.getTransaction()!), tokenIds);
    for (const tokenId of tokenIds) {
      if (!this.tokenMetadata.has(tokenId)) {
        const res = await client.getTokenMetadata([...tokenIds.keys()]);
        res.getTokenMetadataList().forEach(tm => this.tokenMetadata.set(tokenId, tm));
      }
    }

    this.loadingBalance = false;

    if (callback) {
      callback();
    }
  }

  private updateParent = () => {
    if (this.parent) {
      this.parent.forceUpdate();
    }
  }

  private indexTransactionIO(txns: Transaction[], tokenIds: Set<string>) {
    for (const tx of txns) {
      for (const inp of tx.getInputsList()) {
        if (!this.Address.includes(inp.getAddress())) {
          continue;
        }
        const op = this.outpointToKey(inp.getOutpoint()!.getHash_asU8(), inp.getOutpoint()!.getIndex());
        if (inp.hasSlpToken()) {
          const _tokenId = Buffer.from(inp.getSlpToken()!.getTokenId_asU8()).toString("hex");
          tokenIds.add(_tokenId);
          if (!this.slpTxi.has(_tokenId)) {
            this.slpTxi.set(_tokenId, new Map<outpoint, Big>());
          }
          this.slpTxi.get(_tokenId)!.set(op, Big(inp.getValue()));
        } else {
          this.bchTxi.set(op, Big(inp.getValue()));
        }
      }
      for (const out of tx.getOutputsList()) {
        if (!this.Address.includes(out.getAddress())) {
          continue;
        }
        const op = this.outpointToKey(tx.getHash_asU8(), out.getIndex());
        if (out.hasSlpToken()) {
          const _tokenId = Buffer.from(out.getSlpToken()!.getTokenId_asU8()).toString("hex");
          tokenIds.add(_tokenId);
          if (!this.slpTxo.has(_tokenId)) {
            this.slpTxo.set(_tokenId, new Map<outpoint, Big>());
          }
          this.slpTxo.get(_tokenId)!.set(op, Big(out.getValue()));
        } else {
          this.bchTxo.set(op, Big(out.getValue()));
        }
      }
    }
  }

  private outpointToKey(txid: Uint8Array, index: number): string {
    const indexBuf = Buffer.alloc(4);
    indexBuf.writeUInt32LE(index);
    return txid + indexBuf.toString("hex");
  }
}
