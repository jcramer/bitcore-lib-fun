import Big from "big.js";
import { Address, PrivateKey, Script, Transaction } from "bitcore-lib-cash";
import * as mdm from "slp-mdm";
import { Wallet } from "./Wallet";
import { TokenId } from "./Interfaces";
import Utils from "./Utils";

export const DUST_LIMIT = 546; // sats
const FEE_RATE = 1;            // sats/byte

export enum SlpVersionType {
  "TokenVersionType1" = 1,
  "TokenVersionType1_NFT_Child" = 65,
  "TokenVersionType1_NFT_Group" = 129
}

export class TxBuilder {
  private wallet: Wallet;
  private txn = new Transaction();
  private tokenId = "bch";
  private slpOpreturnMessage?: Buffer;
  private slpChangeAmt?: { amount: Big, index: number };
  private slpOutputs = new Array<Big>();

  public get TokenId(): string {
    return this.tokenId;
  }

  public get SlpOutputs(): Array<Big> {
    if (this.slpChangeAmt) {
      return [...this.slpOutputs, this.slpChangeAmt!.amount];
    };
    return [...this.slpOutputs];
  }

  public get SlpChangeOutput(): { amount: Big, index: number } | null {
    if (!this.slpChangeAmt) {
      return null;
    }
    return { amount: this.slpChangeAmt.amount, index: this.slpChangeAmt.index };
  }

  public get BchChangeOutput(): { amount: number, index: number } | null {
    if (!this.txn._changeIndex) {
      return null;
    }
    let idx = this.txn._changeIndex;
    return { amount: this.txn.outputs[idx].satoshis, index: idx };  
  }

  public get Inputs(): Array<Transaction.Input> {
    return [...this.txn.inputs];
  }

  public get Outputs(): Array<[Transaction.Output, Big?]> {
    return this.txn.outputs.map((o, i) => {
      let slpAmt = Big(0);
      if (i > 0 && i-1 < this.slpOutputs.length) {
        slpAmt.add(this.slpOutputs[i-1]);
      } else if (this.slpChangeAmt && i === this.slpOutputs.length+1) {
        slpAmt.add(this.slpChangeAmt.amount);
        if (this.slpChangeAmt.index !== i) {
          throw Error("slp change has wrong index");
        }
      }
      return [o, slpAmt];
    });
  }

  constructor(wallet: Wallet) {
    this.wallet = wallet;
  }

  public AddSlpOutput(address: string, amount: Big, tokenId: string): void {
    if (this.tokenId !== tokenId) {
      this.slpOutputs = [];
      this.tokenId = tokenId;
    }
    if (tokenId === "bch") {
      throw Error("can't add slp token with bch token id")
    }

    // remove bch change
    this.txn._changeScript = undefined;
    if (this.txn._changeIndex !== undefined) {
      this.txn.removeOutput(this.txn._changeIndex);
      this.txn._changeIndex = undefined;
    }

    if (this.slpChangeAmt) {
      this.txn.removeOutput(this.slpChangeAmt!.index);
      this.slpChangeAmt = undefined;
    }

    const index = this.slpOutputs.length + 1;
    this.txn.addOutput(new Transaction.Output({
      script: new Script(new Address(address)),
      satoshis: DUST_LIMIT
    }), index);
    this.slpOutputs.push(amount);

    this.addSlpInputs(tokenId);
    this.addBchInputs();
  }

  public AddBchOutput(address: Address, amount: number): boolean {
    this.txn.to(address, amount);
    let bool = this.addBchInputs();
    return bool;
  }

  public async SignTransaction(getKeys: () => PrivateKeys|Promise<PrivateKeys>): Promise<SignedTxInfo> {
    let pk = await getKeys();
    this.txn.sign(pk);
    const txnHex = this.txn.serialize();
    let fee = this.txn.inputAmount - this.txn.outputAmount;
    return { txnHex, fee, sendAmount: this.txn.outputAmount };
  }

  // addBchInputs selects coins from smallest value to largest adding them to
  // the transaction and checking for sufficient fee. 
  // If sufficient inputs are available true is returned, otherwise false is returned.
  //
  // TODO: respect data banks (coin banks provide better privacy, security, and smart contract interoperability)
  // TODO: abstract this as a coin chooser object added to the wallet
  private addBchInputs(): boolean { // coins: Map<outpoint, { amount: Big, address: Address}>): boolean {
    this.txn.change(this.wallet.Address.toCashAddress());

    const checkInputs = () => {
      this.txn.feePerByte(FEE_RATE);
      let feeRate = Wallet.GetFeeRate(this.txn);

      // let changeAmt = 0;
      // if (this.txn.getChangeOutput()) {
      //   changeAmt = this.txn.getChangeOutput()!.satoshis;
      // }
      // console.log(`input amt: ${this.txn.inputAmount}`);
      // console.log(`output amt: ${this.txn.outputAmount}`);
      // console.log(`change amt: ${changeAmt}`);
      // console.log(`fee rate: ${feeRate}`);

      if (this.txn.inputAmount >= this.txn.outputAmount && feeRate >= FEE_RATE) {
        return true;
      }
      return false;
    };

    let bchCoins = Array.from(this.wallet.BchCoins).sort((a, b) => a[1].satoshis.sub(b[1].satoshis).toNumber());

    for (const coin of bchCoins) {

      // don't add same coin twice
      let skipCoin = false;
      const txid = coin[0].slice(0, 64);
      const vout = Buffer.from(coin[0].slice(64), "hex").readUInt32BE(0);
      for (const input of this.txn.inputs) {
        if (txid === input.prevTxId.toString("hex") && vout === input.outputIndex) {
          skipCoin = true;
          break;
        }
      }
      if (skipCoin) {
        continue;
      }

      // check if current input amount is sufficient
      if (this.txn.outputs.length > 0) {
        if (checkInputs()) {
          return true;
        }
      }

      // add the input
      this.txn.addInput(new Transaction.Input.PublicKeyHash({
        output: new Transaction.Output({
          script: Script.buildPublicKeyHashOut(coin[1].address),
          satoshis: coin[1].satoshis.toNumber()
        }),
        prevTxId: Buffer.from(txid, "hex"),
        outputIndex: vout,
        script: Script.empty()
      }));
      this.txn.feePerByte(FEE_RATE);
    }

    return checkInputs();
  }

  private createMd(tokenId: string, amounts: Big[]) {
    let amts = amounts.map(n => new mdm.BN(n.toFixed()));
    let tm = this.wallet.TokenMetadata.get(tokenId)!;
    switch (tm.getTokenType()) {
      case SlpVersionType.TokenVersionType1:
        return mdm.TokenType1.send(tokenId, amts);
      case SlpVersionType.TokenVersionType1_NFT_Group:
        return mdm.NFT1.Group.send(tokenId, amts);
      case SlpVersionType.TokenVersionType1_NFT_Child:
        return mdm.NFT1.Child.send(tokenId, [new mdm.BN(1)]);
    }
  };

  // addSlpInputs selects slp coins and updates variables slpOutputs and slpChange as required.
  // 
  private addSlpInputs(tokenId: TokenId) {

    // get coins we can access for this slp token
    let slpCoins = Array.from(this.wallet.SlpCoins.get(tokenId)!).sort((a, b) => a[1].amount.sub(b[1].amount).toNumber());

    // method to check inputs >= outputs
    const checkSlpInputs = (): boolean => {

      if (this.slpChangeAmt) {
        this.txn.removeOutput(this.slpChangeAmt!.index);
        this.slpChangeAmt = undefined;
      }

      const slpInputAmt = this.txn.inputs.reduce((p, _, i) => {
        const slpCoins = this.wallet.SlpCoins.get(tokenId)!;
        if (!slpCoins) {
          return Big(0);
        }
        const outpoint = Utils.outpointToKey(this.txn.inputs[i].prevTxId, this.txn.inputs[i].outputIndex, true);
        if (slpCoins.has(outpoint)) {
          return p.add(slpCoins.get(outpoint)!.amount);
        }
        return p;
      }, Big(0));

      const slpOutputAmt = this.slpOutputs.reduce((p, c, i) => p.add(c), Big(0));

      // console.log(`slp input amt: ${slpInputAmt}`);
      // console.log(`slp output amt: ${slpOutputAmt}`);

      if (slpInputAmt.gt(slpOutputAmt)) {
        // set slp change output here
        this.slpChangeAmt = { amount: slpInputAmt.minus(slpOutputAmt), index: this.slpOutputs.length + 1 };
        //console.log(`slp change amt: ${this.slpChangeAmt.amount}`);

        // set the slp change dust output
        this.txn.addOutput(new Transaction.Output({
          //@ts-ignore
          script: new Script(this.wallet.Address!),
          satoshis: DUST_LIMIT
        }), this.slpChangeAmt!.index);
      }

      if (slpInputAmt.gte(slpOutputAmt)) {
        // set the slp metadata message
        if (this.slpOpreturnMessage) {
          this.txn.removeOutput(0);
        }
        const outputs = this.SlpChangeOutput ? [ ...this.slpOutputs, this.slpChangeAmt!.amount ] : this.slpOutputs;
        this.slpOpreturnMessage = this.createMd(tokenId, outputs);
        this.txn.addOutput(new Transaction.Output({
          script: this.slpOpreturnMessage,
          satoshis: 0
        }), 0);
      
        return true;
      }

      return false;
    };

    // loop through available slp coins to check if inputs are needed
    for (const coin of slpCoins) {

      // don't add same coin twice
      let skipCoin = false;
      const txid = coin[0].slice(0, 64);
      const vout = Buffer.from(coin[0].slice(64), "hex").readUInt32BE(0);
      for (const input of this.txn.inputs) {
        if (txid === input.prevTxId.toString("hex") && vout === input.outputIndex) {
          skipCoin = true;
          break;
        }
      }
      if (skipCoin) {
        continue;
      }

      // check if current input amount is sufficient
      if (this.slpOutputs.length > 0) {
        if (checkSlpInputs()) {
          return true;
        }
      }

      // add the slp input
      this.wallet.SlpOutpointCache.set(coin[0], { amount: coin[1].amount, satoshis: coin[1].satoshis, address: coin[1].address, tokenId });
      this.txn.addInput(new Transaction.Input.PublicKeyHash({
        output: new Transaction.Output({
          script: Script.buildPublicKeyHashOut(coin[1].address),
          satoshis: coin[1].satoshis.toNumber()
        }),
        prevTxId: Buffer.from(txid, "hex"),
        outputIndex: vout,
        script: Script.empty()
      }));
    }

    return checkSlpInputs();
  }

}

export type PrivateKeys = Array<PrivateKey | string> | PrivateKey | string
export type SignedTxInfo = { txnHex: string, fee: number, sendAmount: number }
