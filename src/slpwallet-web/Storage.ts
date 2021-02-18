import { bchtxio, OutpointStr, slptxio, TokenId, WalletStorage } from "../slpwallet-core/Interfaces";
import { Address } from "bitcore-lib-cash";
import * as idb from "idb";
import Big from "big.js";

import { DBSchema } from 'idb';
import { TokenMetadata } from "grpc-bchrpc";

interface MyDB extends DBSchema {
  bchtxi: {
    key: string;
    value: BchTxioDbo;
  }
  bchtxo: {
    key: string;
    value: BchTxioDbo;
  }
  slptxi: {
    key: string;
    value: SlpTxioDbo;
  }
  slptxo: {
    key: string;
    value: SlpTxioDbo;
  }
  slptokenmetadata: {
    key: string;
    value: SlpTokenMetadataDbo
  }
}

interface BchTxioDbo {
  txo: OutpointStr;
  satoshis: number;
  address: string;
}

interface SlpTxioDbo {
  txo: OutpointStr;
  tokenId: TokenId;
  amountStr: string;
  satoshis: number;
  address: string;
}

interface SlpTokenMetadataDbo {
  tokenId: TokenId,
  name: string,
  ticker: string,
  decimals: number,
  slpVersionType: number
}

export class BrowserStorage implements WalletStorage {
  public db?: idb.IDBPDatabase<MyDB>;

  constructor() {
    if (!('indexedDB' in window)) {
      throw Error('This browser doesn\'t support IndexedDB')
    }
    this.loadDb();
  }

  public get GetDb() {
    return this.db;
  }

  public GetSeed() {
    return localStorage.getItem("bitcore-fun-seed");
  }

  public SetSeed(seed: string) {
    localStorage.removeItem("bitcore-fun-wif");
    return localStorage.setItem("bitcore-fun-seed", seed);
  }

  public GetWif() {
    return localStorage.getItem("bitcore-fun-wif");
  }

  public SetWif(wif: string) {
    localStorage.removeItem("bitcore-fun-seed");
    return localStorage.setItem("bitcore-fun-wif", wif);
  }

  public GetBlock(address: string): number|null {
    let block = localStorage.getItem(address);
    if (block) {
      return parseInt(block, 10);
    }
    return null;
  }

  public SetBlock(address: string, height: number|null) {
    if (!height) {
      localStorage.removeItem(address);
    }
    return localStorage.setItem(address, height!.toString());
  }

  public async GetAllBchTxi() {
    let txi = new Map<OutpointStr, bchtxio>();
    let items = await this.db!.getAll("bchtxi") as BchTxioDbo[];
    items.forEach(item => {
      txi.set(item.txo, {
        satoshis: new Big(item.satoshis),
        address: new Address(item.address)
      });
    });
    return txi;
  }

  public async AddBchTxi(outpoint: OutpointStr, bchtxi: bchtxio) {
    await this.db!.add("bchtxi", {
      txo: outpoint,
      satoshis: bchtxi.satoshis.toNumber(),
      address: bchtxi.address.toCashAddress()
    } as BchTxioDbo);
  }

  public async GetAllBchTxo() {
    let txi = new Map<OutpointStr, bchtxio>();
    let items = await this.db!.getAll("bchtxo") as BchTxioDbo[];
    items.forEach(item => {
      txi.set(item.txo, {
        satoshis: new Big(item.satoshis),
        address: new Address(item.address)
      });
    });
    return txi;
  }

  public async AddBchTxo(outpoint: OutpointStr, bchtxo: bchtxio) {
    await this.db!.add("bchtxo", {
      txo: outpoint,
      satoshis: bchtxo.satoshis.toNumber(),
      address: bchtxo.address.toCashAddress()
    } as BchTxioDbo);
  }

  public async GetAllSlpTxi() {
    let txi = new Map<TokenId, Map<OutpointStr, slptxio>>();
    let items = await this.db!.getAll("slptxi") as SlpTxioDbo[];
    items.forEach(item => {
      if (!txi.has(item.tokenId)) {
        txi.set(item.tokenId, new Map<OutpointStr, slptxio>());
      }
      let m = txi.get(item.tokenId)!;
      m.set(item.txo, {
        amount: new Big(item.amountStr),
        satoshis: new Big(item.satoshis),
        address: new Address(item.address)
      });
    });
    return txi;
  }

  public async AddSlpTxi(tokenId: TokenId, outpoint: OutpointStr, slptxi: slptxio) {
    await this.db!.add("slptxi", {
      tokenId: tokenId,
      txo: outpoint,
      satoshis: slptxi.satoshis.toNumber(),
      amountStr: slptxi.amount.toFixed(),
      address: slptxi.address.toCashAddress()
    } as SlpTxioDbo);
  }

  public async GetAllSlpTxo() {
    let txi = new Map<TokenId, Map<OutpointStr, slptxio>>();
    let items = await this.db!.getAll("slptxo") as SlpTxioDbo[];
    items.forEach(item => {
      if (!txi.has(item.tokenId)) {
        txi.set(item.tokenId, new Map<OutpointStr, slptxio>());
      }
      let m = txi.get(item.tokenId)!;
      m.set(item.txo, {
        amount: new Big(item.amountStr),
        satoshis: new Big(item.satoshis),
        address: new Address(item.address)
      });
    });
    return txi;
  }

  public async AddSlpTxo(tokenId: TokenId, outpoint: OutpointStr, slptxo: slptxio) {
    await this.db!.add("slptxo", {
      tokenId: tokenId,
      txo: outpoint,
      satoshis: slptxo.satoshis.toNumber(),
      amountStr: slptxo.amount.toFixed(),
      address: slptxo.address.toCashAddress()
    } as SlpTxioDbo);
  }

  public async GetAllTokenMetadata() {
    let tm = new Map<TokenId, TokenMetadata>();
    let items = await this.db!.getAll("slptokenmetadata") as SlpTokenMetadataDbo[];
    items.forEach(item => {

    });
  }

  public async AddTokenMetadata(tokenId: TokenId, tm: TokenMetadata) {

  }

  public async loadDb() {
    this.db = await idb.openDB<MyDB>("slpwallet", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("bchtxi")) {
          db.createObjectStore("bchtxi", { keyPath: "txo" });
        }
        if (!db.objectStoreNames.contains("bchtxo")) {
          db.createObjectStore("bchtxo", { keyPath: "txo" });
        }
        if (!db.objectStoreNames.contains("slptxi")) {
          db.createObjectStore("slptxi", { keyPath: "txo" });
        }
        if (!db.objectStoreNames.contains("slptxo")) {
          db.createObjectStore("slptxo", { keyPath: "txo" });
        }
        if (!db.objectStoreNames.contains("slptokenmetadata")) {
          db.createObjectStore("slptokenmetadata", { keyPath: "tokenId" });
        }
        console.log("upgrade complete");
      }
    });
    console.log("db created");
  }
}
