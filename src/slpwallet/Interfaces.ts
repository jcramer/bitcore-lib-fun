export interface App {
    UpdateWalletUI: () => any;  // wallet will call this when UI updates are needed
                                // wallet will call this to display a message for the user
}

export interface WalletStorage {
    GetSeed(): string|null;
    SetSeed(seed: string): void;
    GetWif(): string|null;
    SetWif(wif: string): void;
    GetNode(): string|null;
    SetNode(node: string): void;
    GetBlock(address: string): number|null;
    SetBlock(address: string, block: number|null): void;
}

export type TokenId = string;
export type Outpoint = string;
export type Txid = string;
export type Address = string;
export type Bank = string;

export enum AddressKind {
  P2PKH = 'p2pkh',
  P2SH = 'p2sh'    
}
