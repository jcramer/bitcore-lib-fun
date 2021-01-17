import { Big } from "big.js";
import * as bip32 from "bip32";
import * as bip39 from "bip39";
import { PrivateKey } from "bitcore-lib-cash";
import { BlockNotification, GrpcClient, TokenMetadata, Transaction, TransactionNotification } from "grpc-bchrpc-web";
import App from "./App";
import { CacheSet } from "./CacheSet";

type tokenId = string;
type outpoint = string;

const txidSeen = new CacheSet<string>(100000);
const addressPath = "m/44'/245'/0'/0/0";
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export class Wallet {
  private parent?: App;
  private mnemonic: string;
  private privateKey: PrivateKey;
  private networkUrl = "https://bchd.ny1.simpleledger.io";
  private loadingBalance = false;
  private bchTxi = new Map<outpoint, Big>();
  private bchTxo = new Map<outpoint, Big>();
  private slpTxi = new Map<tokenId, Map<outpoint, Big>>();
  private slpTxo = new Map<tokenId, Map<outpoint, Big>>();
  private tokenMetadata = new Map<tokenId, TokenMetadata>();

  constructor(parent?: App) {

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

  public get BchCoins() {
    let coins = new Map<outpoint, Big>();
    this.bchTxo.forEach((amt, outpoint) => {
      coins.set(outpoint, amt);
      if (this.bchTxi.has(outpoint)) {
        coins.delete(outpoint);
      }
    });
    return coins;
  }

  public get SlpCoins() {
    let coins = new Map<tokenId, Map<outpoint, Big>>();
    this.slpTxo.forEach((_coins, tokenid) => {
      coins.set(tokenid, _coins);
      let inputs = this.slpTxi.get(tokenid);
      if (inputs) {
        _coins.forEach((_, outpoint) => {
          if (inputs!.has(outpoint)) {
            _coins.delete(outpoint);
          }
        });
      }
    });
    return coins;
  }

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
      let bal = slpBals.get(coins[0])!;
      if (!bal) { bal = Big(0); }
      let outs = Array.from(coins[1]).reduce((p, c) => p.add(c[1]), Big(0));
      slpBals.set(coins[0], outs.sub(bal));
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

  public Subscribe() {

    // setup a self-healing stream for mempool transactions
    const createTxnStream = async () => {
      const client = new GrpcClient({ url: this.networkUrl });
      const txnStream = await client.subscribeTransactions({
        includeMempoolAcceptance: true,
        includeBlockAcceptance: false,
        includeSerializedTxn: false,
        addresses: [this.Address]
      });
      txnStream.on("end", async (error) => {
        while (true) {
          await sleep(30000);
          try {
            console.log(`[WALLET] trying to re-establish txn data stream...`);
            createTxnStream();
            break;
          } catch (error) {
            console.log(error);
          }
        }
      });
      txnStream.on("data", async (data: TransactionNotification) => {
        const txid = Buffer.from(data.getUnconfirmedTransaction()!.getTransaction()!.getHash_asU8()).toString("hex");
        if (txidSeen.has(txid)) {
          return;
        }
        txidSeen.push(txid);
        console.log(`${txid}`);

        const tokenIds = new Set<string>();
        this.indexTransactionIO([data.getUnconfirmedTransaction()!.getTransaction()!], tokenIds);
        for (const tokenId of tokenIds) {
          if (!this.tokenMetadata.has(tokenId)) {
            const res = await client.getTokenMetadata([...tokenIds.keys()]);
            res.getTokenMetadataList().forEach(tm => this.tokenMetadata.set(tokenId, tm));
          }
        }

        this.UpdateBalances(this.updateParent);
      });
      console.log(`[WALLET] txn data stream established.`);
    };
    createTxnStream();

    // setup a self-healing stream for getting serialized block data
    const createBlockDataStream = async () => {
      const client = new GrpcClient({ url: this.networkUrl });
      const blockDataStream = await client.subscribeBlocks({ includeSerializedBlock: true });
      blockDataStream.on("end", async (error) => {
        while (true) {
          await sleep(30000);
          try {
            console.log(`[WALLET] trying to re-establish block data stream...`);
            createBlockDataStream();
            break;
          } catch (_) {}
        }
      });
      blockDataStream.on("data", async (data: BlockNotification) => {
        // const blockBuf = Buffer.from(data.getSerializedBlock_asU8());
        // const block = new Block(blockBuf);
        console.log("BLOCK found");
        // for (const txn of block.transactions) {
        //   // todo...
          
        // }
      });
      console.log(`[WALLET] block data stream established.`);
    };
    createBlockDataStream();

    // setup a self-healing stream for getting block height
    const createBlockInfoStream = async () => {
      const client = new GrpcClient({ url: this.networkUrl });
      const blockInfoStream = await client.subscribeBlocks();
      blockInfoStream.on("end", async (error) => {
        while (true) {
          await sleep(30000);
          try {
            console.log(`[WALLET] trying to re-establish block info stream...`);
            createBlockInfoStream();
            break;
          } catch (_) {}
        }
      });
      blockInfoStream.on("data", async (data: BlockNotification) => {
        const height = data.getBlockInfo()!.getHeight();
        console.log(`Block found: ${height}`);
      });
      console.log(`[WALLET] block info stream established.`);
    };
    createBlockInfoStream();
  }

  private updateParent = () => {
    if (this.parent) {
      this.parent.Redraw();
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
          this.slpTxi.get(_tokenId)!.set(op, Big(inp.getSlpToken()!.getAmount()));
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
          this.slpTxo.get(_tokenId)!.set(op, Big(out.getSlpToken()!.getAmount()));
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
