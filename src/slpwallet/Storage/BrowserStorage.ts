import { WalletStorage } from "../Interfaces";

export class BrowserLocalStorage implements WalletStorage {
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
}
