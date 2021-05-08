import { App, WalletStorage } from "./Interfaces";
import { Wallet } from "./Wallet";
import { BrowserLocalStorage } from "./Storage/BrowserStorage";
import { BchdNetwork } from "./Network/BchdNetwork";

const DEFAULT_RPC_NODE = 'https://bchd.fountainhead.cash';

// DomWallet is the most simple wallet implementation intended for prototyping purposes
// by default using the browser's local storage for storing private keys.
export class DomWallet {
    public Ready = false;
    public Network = new BchdNetwork(process.env.REACT_APP_RPC_SERVER || DEFAULT_RPC_NODE);
    public Wallet: Wallet;
    public Storage = new BrowserLocalStorage();

    constructor(app: App, storage?: WalletStorage, network?: BchdNetwork) {
        if (window === undefined) {
            throw Error("access to 'window' is not available.");
        }
        if (storage) {
            this.Storage = storage;
        }
        if (network) {
            this.Network = network;
        }
        this.Wallet = new Wallet(this.Storage, this.Network, app);
    }

    public setNode(node: string) {
        this.Network.SetUri(`https://${node}`);
        this.Storage.SetNode(node);
    }
};
