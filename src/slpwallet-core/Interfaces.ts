import Big from "big.js";
import { Address } from "bitcore-lib-cash";
import * as bchrpc from "grpc-bchrpc";

export interface App {
    UpdateWalletUI: () => any;  // wallet will call this when UI updates are needed
}

export interface WalletStorage {
    GetDb: any;
    GetSeed(): string|null;
    SetSeed(seed: string): void;
    GetWif(): string|null;
    SetWif(wif: string): void;
    GetBlock(address: string): number|null;
    SetBlock(address: string, block: number|null): void;
    GetAllBchTxi(): Promise<Map<OutpointStr, bchtxio>>;
    AddBchTxi(outpoint: OutpointStr, bchtxi: bchtxio): Promise<void>;
    GetAllBchTxo(): Promise<Map<OutpointStr, bchtxio>>;
    AddBchTxo(outpoint: OutpointStr, bchtxo: bchtxio): Promise<void>;
    GetAllSlpTxi(): Promise<Map<TokenId, Map<OutpointStr, slptxio>>>;
    AddSlpTxi(tokenId: TokenId, outpoint: OutpointStr, slpTxi: slptxio): Promise<void>;
    GetAllSlpTxo(): Promise<Map<TokenId, Map<OutpointStr, slptxio>>>;
    AddSlpTxo(tokenId: TokenId, outpoint: OutpointStr, slpTxo: slptxio): Promise<void>;
    loadDb(): Promise<void>;
}

export interface Network {
  SendTransaction(txnHex: string, callback?: () => any): Promise<string>;
  GetTransaction(txid: string): Promise<bchrpc.GetTransactionResponse>;
  GetTokenMetadata(tokenIds: string[]): Promise<bchrpc.GetTokenMetadataResponse>;
  GetAddressTransactions(address: string, sinceBlock?: number): Promise<bchrpc.GetAddressTransactionsResponse>;
  Subscribe(addresses: string[], onTransactionNotification: (txn: bchrpc.Transaction) => any): Promise<void>;
}

export type TokenId = string;
export type OutpointStr = string;
export type Txid = string;
export type AddressStr = string;
export type Bank = string;

export type bchtxio = { satoshis: Big, address: Address}
export type bchtxioMap = Map<OutpointStr, bchtxio>;
export type slptxio = { amount: Big, address: Address, satoshis: Big }
export type slptxioMap = Map<TokenId, Map<OutpointStr, slptxio>>;

export enum AddressKind {
  P2PKH = 'p2pkh',
  P2SH = 'p2sh'    
}
