import { App, WalletStorage } from "../slpwallet-core/Interfaces";
import { Wallet } from "../slpwallet-core/Wallet";
import { BrowserStorage } from "./Storage";
import { BchdNetwork } from "./BchdNetwork";

// BrowserWalletContainer is a container for a wallet using the browser
// storage for storing private keys and transaction history.
export class BrowserWalletContainer {
    public Ready = false;
    public Network = new BchdNetwork(process.env.REACT_APP_RPC_SERVER!);
    public Wallet: Wallet;
    public Storage = new BrowserStorage();

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
};
