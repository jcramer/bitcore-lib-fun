import { Big } from "big.js";
import * as bip32 from "bip32";
import * as bip39 from "bip39";
import { Address, PrivateKey, Transaction as Txn } from "bitcore-lib-cash";
import { TokenMetadata, Transaction } from "grpc-bchrpc-web";

import { App, Outpoint, TokenId, WalletStorage } from "./Interfaces";
import { CacheSet } from "../CacheSet";
import { BchdNetwork } from "./Network/BchdNetwork";
import Utils from "./Utils";

const txidsSeen = new CacheSet<string>(100000);
const addressPath = "m/44'/245'/0'/0/0";

export class Wallet {

  public SlpOutpointCache = new Map<Outpoint, { amount: Big, address: Address, satoshis: Big, tokenId: string}>();

  public static EstimateTxnSize(txn: Txn) {
    return txn._estimateSize();
  }

  public static GetFeeRate(txn: Txn) {
    let size = Wallet.EstimateTxnSize(txn);
    console.log(`estimated size: ${size}`);

    const fee = txn.inputAmount - txn.outputAmount;
    if (!fee || fee < 0) {
      return 0;
    }
    let rate = fee / size;
    console.log(`estimated fee rate: ${rate}`);
    return rate;
  }

  private storage: WalletStorage;
  private network: BchdNetwork;
  private parent?: App;
  private mnemonic?: string;
  private privateKey: PrivateKey;

  // // this will be used by the application api to access coins
  // private banks = new Map<bank, { addresses: Set<address>, domain: string }>();
  // private addresses = new Map<address, { bank: string, kind: AddressKind, info: number|Buffer }>();
  // private transactions = new Map<txid, { height: number }>();

  private bchTxi = new Map<Outpoint, { satoshis: Big, address: Address}>();
  private bchTxo = new Map<Outpoint, { satoshis: Big, address: Address}>();
  private slpTxi = new Map<TokenId, Map<Outpoint, { amount: Big, address: Address, satoshis: Big }>>();
  private slpTxo = new Map<TokenId, Map<Outpoint, { amount: Big, address: Address, satoshis: Big }>>();

  // private bch = new Map<bank, { bchTxi: Map<address, Map<outpoint, Big>>, bchTxo: Map<address, Map<outpoint, Big>> }>();
  // private slp = new Map<bank, Map<tokenId, { slpTxi: Map<address, Map<outpoint, Big>>, slpTxo: Map<address, Map<outpoint, Big>> }>>();

  private tokenMetadata = new Map<TokenId, TokenMetadata>();

  constructor(storage: WalletStorage, network: BchdNetwork, parent?: App) { // bankPermissions: bank[]) {
    this.storage = storage;
    this.network = network;
    this.parent = parent;
    
    // check for wif first
    if (this.storage.GetWif()) {
      this.privateKey = new PrivateKey(this.storage.GetWif()!);
    } else {
      this.mnemonic = bip39.generateMnemonic();
      let seed = bip32.fromSeed(bip39.mnemonicToSeedSync(this.mnemonic));
      let child = seed.derivePath(addressPath);
      this.privateKey = new PrivateKey(child.toWIF());
      if (this.storage.GetSeed() === null) {
        this.storage.SetSeed(this.mnemonic);
      } else {
        this.mnemonic = this.storage.GetSeed()!;
        seed = bip32.fromSeed(bip39.mnemonicToSeedSync(this.mnemonic));
        child = seed.derivePath(addressPath);
        this.privateKey = new PrivateKey(child.toWIF());
      }
    }
  }

  public get Mnemonic() {
    return this.mnemonic;
  }

  public get Wif() {
    if (this.mnemonic) {
      return null;
    }
    return this.privateKey.toWIF();
  }

  public get XPub() {
    if (!this.Mnemonic) {
      return null;
    }
    let seed = bip32.fromSeed(bip39.mnemonicToSeedSync(this.Mnemonic)).neutered();
    return seed.toBase58();
  }

  public get PrivateKey() {
    return this.privateKey.toWIF();
  }

  public set PrivateKey(_bip39_or_wif: string) {
    if (! bip39.validateMnemonic(_bip39_or_wif)) {
      try {
        this.privateKey = new PrivateKey(_bip39_or_wif);
      } catch (_) {
        throw Error("invalid mnemonic and invalid wif");
      }
    } else {
      const seed = bip32.fromSeed(bip39.mnemonicToSeedSync(this.mnemonic!));
      const child = seed.derivePath(addressPath);
      this.privateKey = new PrivateKey(child.toWIF());
    }

    this.LoadInitialBalances();
  }

  public get Address() { return this.privateKey.toAddress(); }

  public get BchCoins() {
    let coins = new Map<Outpoint, { satoshis: Big, address: Address }>();
    this.bchTxo.forEach((dat, outpoint) => {
      coins.set(outpoint, dat);
      if (this.bchTxi.has(outpoint)) {
        coins.delete(outpoint);
      }
    });
    return coins;
  }

  public get SlpCoins() {
    let coins = new Map<TokenId, Map<Outpoint, { amount: Big, address: Address, satoshis: Big }>>();
    this.slpTxo.forEach((_coins, tokenId) => {
      let coinMap: Map<Outpoint, { amount: Big, address: Address, satoshis: Big }>;
      if (!coins.has(tokenId)) {
        let coinMap = new Map<Outpoint, { amount: Big, address: Address, satoshis: Big }>();
        coins.set(tokenId, coinMap);
      }
      coinMap = coins.get(tokenId)!;
      let inputs = this.slpTxi.get(tokenId);
      _coins.forEach((dat, outpoint) => {
        coinMap.set(outpoint, dat);
        if (!this.SlpOutpointCache.has(outpoint)) {
          this.SlpOutpointCache.set(outpoint, { amount: dat.amount, satoshis: dat.satoshis, address: dat.address, tokenId });
        }
        if (inputs && inputs!.has(outpoint)) {
          coinMap.delete(outpoint);
        }
      });

    });
    return coins;
  }

  public get TokenMetadata() { return this.tokenMetadata; }

  public isMine(address: string) {
    if (address === this.Address.toCashAddress()) {
      return true;
    }
    return false;
  }

  // GetChangeOutput returns an array of transaction outputs that
  // will be sent to this wallet.  Note that txn.getChangeOutput() has
  // been found to be unreliable perhaps due to the way outputs are added
  // to transactions by this wallet class.
  public GetChangeOutput(txn: Txn): Array<Txn.Output> {
    let change: Array<Txn.Output> = [];
    txn.outputs.forEach(output => { 
      if (this.isMine(output.script.toAddress().toCashAddress())) {
        change.push(output);
      }
    });

    return change;
  }

  public async LoadInitialBalances() {
    this.bchTxi = new Map<Outpoint, { satoshis: Big, address: Address}>();
    this.bchTxo = new Map<Outpoint, { satoshis: Big, address: Address}>();
    this.slpTxi = new Map<TokenId, Map<Outpoint, { amount: Big, address: Address, satoshis: Big }>>();
    this.slpTxo = new Map<TokenId, Map<Outpoint, { amount: Big, address: Address, satoshis: Big }>>();
  
    const res = await this.network.GetAddressTransactions(this.Address.toCashAddress());
    await this.indexTransactionIO(res.getConfirmedTransactionsList());
    await this.indexTransactionIO(res.getUnconfirmedTransactionsList()!.map(o => o.getTransaction()!));
    this.updateParent();
  }

  public UpdateMnemonic(m: string) {
    if (! bip39.validateMnemonic(m)) {
      try {
        // @ts-ignore
        PrivateKey._transformWIF(m);
        this.privateKey = PrivateKey.fromWIF(m);
        this.mnemonic = undefined;
        this.storage.SetWif(m);
      } catch (_) {
        throw Error("invalid mnemonic and invalid wif");
      }
    } else {
      this.mnemonic = m;
      this.storage.SetSeed(this.mnemonic);
      localStorage.setItem("bitcore-fun-seed", this.mnemonic);
      const seed = bip32.fromSeed(bip39.mnemonicToSeedSync(this.mnemonic));
      const child = seed.derivePath(addressPath);
      this.privateKey = new PrivateKey(child.toWIF());
    }

    this.LoadInitialBalances();
  }

  public GetBchBalance(): Big {
    const inputAmt = Array.from(this.bchTxi!).reduce((p, c) => p.add(c[1].satoshis), Big(0));
    return Array.from(this.bchTxo!).reduce((p, c) => p.add(c[1].satoshis), Big(0)).sub(inputAmt);
  }

  public GetSlpBalances(): Map<TokenId, Big> {
    const slpBals = new Map<TokenId, Big>();
    Array.from(this.slpTxi!).forEach((coins) => {
      slpBals.set(coins[0], Array.from(coins[1]).reduce((p, c) => p.add(c[1].amount), Big(0)));
    });
    Array.from(this.slpTxo!).forEach((coins) => {
      let bal = slpBals.get(coins[0])!;
      if (!bal) { bal = Big(0); }
      let outs = Array.from(coins[1]).reduce((p, c) => p.add(c[1].amount), Big(0));
      slpBals.set(coins[0], outs.sub(bal));
    });
    return slpBals;
  }

  private updateParent = () => {
    if (this.parent) {
      this.parent.UpdateWalletUI();
    }
  }

  public Subscribe() {
    const cb = (txn: Transaction) => {
      this.processNewTransaction(txn);
    };
    this.network.Subscribe([this.Address.toCashAddress()], cb);
  }

  private async processNewTransaction(txn: Transaction) {
    const txid = Utils.hashToTxid(txn.getHash_asU8());
    if (txidsSeen.has(txid)) {
      return;
    }
    txidsSeen.push(txid);
    console.log(`${txid}`);
    await this.indexTransactionIO([txn]);
    this.updateParent();
  };

  public async SendTransaction(txnHex: string) {
    const txid = await this.network.SendTransaction(txnHex);
    const txn = await this.network.GetTransaction(txid);
    this.processNewTransaction(txn.getTransaction()!);
    return txid;
  }

  private async indexTransactionIO(txns: Transaction[]) {
    let tokenIds = new Set<string>();

    for (const tx of txns) {
      for (const inp of tx.getInputsList()) {
        if (!this.Address.toCashAddress().includes(inp.getAddress())) {
          continue;
        }
        const op = Utils.outpointToKey(inp.getOutpoint()!.getHash_asU8(), inp.getOutpoint()!.getIndex());
        if (inp.hasSlpToken()) {
          const _tokenId = Buffer.from(inp.getSlpToken()!.getTokenId_asU8()).toString("hex");
          tokenIds.add(_tokenId);
          if (!this.slpTxi.has(_tokenId)) {
            this.slpTxi.set(_tokenId, new Map<Outpoint, { amount: Big, address: Address, satoshis: Big }>());
          }
          this.slpTxi.get(_tokenId)!.set(op, { amount: Big(inp.getSlpToken()!.getAmount()), address: new Address(inp.getAddress()), satoshis: Big(inp.getValue()) });
        } else {
          this.bchTxi.set(op, { satoshis: Big(inp.getValue()), address: new Address(inp.getAddress()) });
        }
      }
      for (const out of tx.getOutputsList()) {
        if (!out.getAddress() || !this.Address.toCashAddress().includes(out.getAddress())) {
          continue;
        }
        const op = Utils.outpointToKey(tx.getHash_asU8(), out.getIndex());
        if (out.hasSlpToken()) {
          const _tokenId = Buffer.from(out.getSlpToken()!.getTokenId_asU8()).toString("hex");
          tokenIds.add(_tokenId);
          if (!this.slpTxo.has(_tokenId)) {
            this.slpTxo.set(_tokenId, new Map<Outpoint, { amount: Big, address: Address, satoshis: Big }>());
          }
          this.slpTxo.get(_tokenId)!.set(op, { amount: Big(out.getSlpToken()!.getAmount()), address: new Address(out.getAddress()), satoshis: Big(out.getValue()) });
        } else {
          this.bchTxo.set(op, { satoshis: Big(out.getValue()), address: new Address(out.getAddress()) });
        }
      }
    }

    const tmRes = await this.network.GetTokenMetadata([...tokenIds.keys()]);
    tmRes.getTokenMetadataList().forEach(tm => this.tokenMetadata.set(Buffer.from(tm.getTokenId_asU8()).toString("hex"), tm));
  }
}
