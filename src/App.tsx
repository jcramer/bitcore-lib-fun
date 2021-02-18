import React, { Component } from "react";
import { Confirm, Alert } from 'react-st-modal';
import "./App.css";
import logo from "./logo.svg";
import QRCode from "qrcode.react";

import { Address } from "bitcore-lib-cash";
import bchaddr from "bchaddrjs-slp";
import { Big } from "big.js";
import { TokenMetadata } from "grpc-bchrpc-web/pb/bchrpc_pb";

import { DUST_LIMIT, TxBuilder } from "./slpwallet-core/TxBuilder";
import { BrowserWalletContainer } from "./slpwallet-web";
import Utils from "./slpwallet-core/Utils";

interface IProps {}

interface IState {
  showPrivKey?: boolean;
  showSlpAddressFormat?: boolean;
  useMainnet?: boolean;
  address?: string;
  checkingBalance?: boolean;
  showCoins?: boolean;
  showTxnInputs?: boolean;
  showBchHistory?: boolean;
  showSlpHistory?: boolean;
  outputAddressValue?: string;
  outputAddressValid?: boolean;
  outputAmountValue?: string;
  outputAmountValid?: boolean;
  selectedSlpTokenId?: string;
  slpOutputs?: Array<Big>;
  slpChangeAmt?: Big;
  currentTxn?: TxBuilder;
  txnValidationErrors?: Set<string>;
}

enum TxnErrorTypes {
  LOW_BCH_INPUTS = "insufficient bch inputs",
  LOW_SLP_INPUTS = "insufficient slp inputs",
  INVALID_OUTPUT_ADDRESS = "invalid address",
  NON_SLP_ADDRESS = "address isn't slp format",
  INVALID_OUTPUT_AMOUNT = "invalid amount",
  BELOW_DUST_LIMIT = "output is lower than dust limit",
  ZERO_SLP_OUTPUT = "must have slp output > 0",
  TOO_MANY_SLP_DECIMAL_PLACES = "too many decimal places for this slp token"
}

const myTableStyle = {
  border:"2px solid grey", 
  "marginLeft": "auto",
  "marginRight": "auto"
} as React.CSSProperties;

class App extends Component<IProps, IState> {
  private readonly slpWallet: BrowserWalletContainer = new BrowserWalletContainer(this);
  private mounted = false;

  constructor(props: IProps) {
    super(props);

    this.state = {
      showPrivKey: false,
      showSlpAddressFormat: true,
      address: bchaddr.toSlpAddress(this.slpWallet.Wallet.Address.toCashAddress()),
      useMainnet: true,
      checkingBalance: true,
      showCoins: false,
      showTxnInputs: false,
      showBchHistory: false,
      showSlpHistory: false,
      outputAddressValue: "",
      outputAddressValid: false,
      outputAmountValue: "",
      outputAmountValid: false,
      selectedSlpTokenId: "bch",
      slpOutputs: [],
      currentTxn: new TxBuilder(this.slpWallet.Wallet),
      txnValidationErrors: new Set<string>()
    };
  }

  public componentDidMount() {
    this.mounted = true;
    this.slpWallet.Wallet.LoadInitialBalances();
    this.slpWallet.Wallet.Subscribe();
  }

  public UpdateWalletUI() {
    if (this.mounted) {
      this.forceUpdate();
    }
  }

  public render() {
    return (
      <div className="App">
        <header className="App-header">
            {/* Learn more about BCH! */}
            <br/>
            <a
              className="App-link"
              href="https://bch.info"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img src={logo} className="App-logo" alt="logo" width="30%" height="30%"/>
            </a> <h3>Web Wallet</h3>
        </header>
          {/* Display private key backup! */}
          <br/><br/>
          <strong>Back up your funds with your 12-word seed phase!!!</strong><br/>
          <div hidden={!this.state.showPrivKey}>
            WIF or Seed Phrase:<br/><input defaultValue={`${this.slpWallet.Wallet.Mnemonic ? this.slpWallet.Wallet.Mnemonic : this.slpWallet.Wallet.Wif}`} onChange={this.importMnemonic}/><br/>
            <div hidden={this.slpWallet.Wallet.XPub === null}>
              Xpub:<br/>{this.slpWallet.Wallet.XPub}
            </div>
          </div>

          <button
            onClick={this.toggleMnemonic}
          >
            {this.state.showPrivKey ? "Hide" : "Show"} Private Keys
          </button>

          {/* Display network mode */}
          {/* <p>
            <strong>BCHD Network:</strong><br/>
            {this.state.useMainnet ? "Mainnet" : "Testnet3" }<br/>
            ({this.domWallet.Wallet.NetworkUrl})<br/>
            <button
              onClick={this.toggleNetwork}
            >
              Switch to {this.state.useMainnet ? "testnet3" : "mainnet" }
            </button>
          </p> */}

          {/* Display address */}
          <p>
            <strong>Your wallet address:</strong><br/>
            {this.state.address!}<br/>
            <button
            onClick={this.toggleAddrFormat}
            >
              Switch to {this.state.showSlpAddressFormat ? "cash" : "slp" }Addr format
            </button>
          </p>
          <QRCode value={this.state.address!} /><br/>

          {/* Display SLP token balances */}
          <div hidden={this.slpWallet.Wallet.SlpCoins.size === 0}>
            <strong>Balances:</strong><br/>
            <table style={myTableStyle}>
              <thead><tr><th>name</th><th>amount</th></tr></thead>
              <tbody>
                <tr key="bch-bal"><td>BCH</td><td>{this.slpWallet.Wallet.GetBchBalance().div(10**8).toFixed(8)}</td></tr>
              {
                Array.from(this.slpWallet.Wallet.GetSlpBalances()).map(b => {
                  return (<tr key={`${b[0]}-bal`}><td>{this.getTokenName(b[0])}</td><td>{this.getSlpAmountString(b[1], b[0])}</td></tr>);
                })
              }
              </tbody>
            </table>
          </div><br/>
          <p hidden={this.slpWallet.Wallet.SlpCoins!.size !== 0}>
            No BCH or SLP balance.
          </p>

          {/* BCH Txn History */}
          <div hidden={this.slpWallet.Wallet.BchCoins.size === 0}>
            <button
              onClick={() => this.setState({ showBchHistory: !this.state.showBchHistory })}
            >
              {this.state.showBchHistory ? "Hide" : "Show"} BCH History
            </button>
          </div>
          <div hidden={!this.state.showBchHistory}>
            --BCH HISTORY HERE--
          </div><br/>


          {/* SLP Transaction History */}
          <div hidden={this.slpWallet.Wallet.SlpCoins.size === 0}>
            <button
              onClick={() => this.setState({ showSlpHistory: !this.state.showSlpHistory })}
            >
              {this.state.showSlpHistory ? "Hide" : "Show"} SLP History
            </button>
          </div>
          <div hidden={!this.state.showSlpHistory}>
            --SLP HISTORY HERE--
          </div><br/>

          {/* Coins */}
          <div hidden={this.slpWallet.Wallet.BchCoins.size === 0 && this.slpWallet.Wallet.SlpCoins.size === 0}>
            <button
              onClick={() => this.setState({ showCoins: !this.state.showCoins })}
            >
              {this.state.showCoins ? "Hide" : "Show"} Unspent Coins
            </button>
          </div>
          <div hidden={!this.state.showCoins}>
            <strong>Unspent Coins</strong>
            <table style={myTableStyle}>
              <thead><tr><th>UTXO</th><th>Value</th><th>Name</th></tr></thead>
              <tbody>
                {Array.from(this.slpWallet.Wallet.BchCoins).map(c => {
                  return (<tr key={c[0]}><td>{Utils.keyToOutpointString(c[0])}</td><td>{c[1].satoshis.div(10**8).toFixed(8)}</td><td>BCH</td></tr>);
                })}
                {Array.from(this.slpWallet.Wallet.SlpCoins).map(([tokenId, coins]) => {
                  return Array.from(coins).map(c => {
                    return (<tr key={c[0]}><td>{Utils.keyToOutpointString(c[0])}</td><td>{this.getSlpAmountString(c[1].amount, tokenId)}</td><td>{this.getTokenName(tokenId)}</td></tr>);
                  })
                })}
              </tbody>
            </table>
          </div><br/>

          {/* Create a Transaction */}
          <strong>Create a Transaction</strong><br/>
          <select value={this.state.selectedSlpTokenId} onChange={this.updateSelectedToken}>
            {Array.from(this.slpWallet.Wallet.SlpCoins).map(([tokenId, _]) => (<option key={tokenId} value={tokenId}>{`SLP -> ${this.getTokenName(tokenId)} (${this.getTokenTypeString(tokenId)})`}</option>))}
            <option key="bch" value="bch">Bitcoin Cash</option>
          </select><br/>
          <label htmlFor="payto">PayTo:</label><br/>
          <input id="payto" value={this.state.outputAddressValue} placeholder={this.state.selectedSlpTokenId! === "bch" ? "cash or slp address" : "slp address"} onChange={this.updateOutputAddress}></input><br/>
          <label htmlFor="amount">Amount:</label><br/>
          <input id="amount" value={this.state.outputAmountValue} placeholder={this.getTokenTicker()} onChange={this.updateOutputValue}></input><br/>
          <button onClick={this.setMaxAmount}>Max</button><button onClick={this.addOutput}>Add Output</button><br/>
          <div hidden={this.state.txnValidationErrors!.size === 0}>
            <br/><strong>Validation Errors</strong>
            <table style={myTableStyle}>
              <tbody>
                {Array.from(this.state.txnValidationErrors!).map((err, i) => {
                    return (<tr key={i}><td>{err}</td></tr>);
                })}
              </tbody>
            </table>
          </div><br/>

          {/* Show Txn Inputs */}
          <div hidden={this.state.currentTxn!.Inputs.length === 0}>
            <div hidden={!this.state.showTxnInputs!}>
              Txn Inputs
              <table style={myTableStyle}>
                <tbody>
                  {Array.from(this.state.currentTxn!.Inputs).map((input, i) => {
                    let outpoint = Utils.outpointToKey(input.prevTxId, input.outputIndex, true);
                    let slpOut = this.slpWallet.Wallet.SlpOutpointCache.get(outpoint)!;
                    if (slpOut) {
                      return (<tr key={i}><td>{`${input.prevTxId.toString("hex")}:${input.outputIndex}, ${this.getSlpAmountString(slpOut.amount, slpOut.tokenId)} ${this.getTokenTicker(slpOut.tokenId)}, ${slpOut.satoshis} sats`}</td></tr>);
                    }
                    return (<tr key={i}><td>{`${input.prevTxId.toString("hex")}:${input.outputIndex}, ${input.output!.satoshis} sats`}</td></tr>);
                  })}
                </tbody>
              </table>
            </div>
            <button
              onClick={() => this.setState({ showTxnInputs: !this.state.showTxnInputs })}
            >
              {this.state.showTxnInputs! ? "Hide" : "Show"} Transaction Inputs
            </button>
          </div><br/>

          {/* Show Txn Outputs */}
          <div hidden={this.state.currentTxn!.Outputs.length === 0}>
            <strong>Txn Outputs</strong>
            <table style={myTableStyle}>
              <tbody>
                  {Array.from(this.state.currentTxn!.Outputs).map((output, i) => {
                    if (output[0].script.isDataOut()) {
                      return (<tr key={i}><td>{`SLP Metadata message, ${output[0].script.toBuffer().length} bytes, ${output[0].satoshis} sats`}</td></tr>);
                    }
                    let slpOuts = this.state.currentTxn!.SlpOutputs;
                    if (slpOuts.length > 0 && i <= slpOuts.length) {
                      return (<tr key={i}><td>{`${output[0].script.toAddress().toCashAddress()}, ${this.getSlpAmountString(slpOuts[i-1])} ${this.getTokenTicker()}, ${output[0].satoshis} sats`}</td></tr>);
                    }
                    return (<tr key={i}><td>{`${output[0].script.toAddress().toCashAddress()}, ${output[0].satoshis} sats`}</td></tr>);
                  })}
              </tbody>
            </table><br/>
          </div><br/>

          <div hidden={this.state.currentTxn!.Outputs.length === 0 || this.state.txnValidationErrors!.size !== 0}>
            <button onClick={this.sendTransaction}>Send</button>
          </div>
          <div>
            <button onClick={this.clearTransaction}>Clear</button>
          </div><br/>
        </div>
    );
  }

  public setState(state: IState) {
    return new Promise((resolve: any) => {
      super.setState(state, resolve);
    });
  }

  private validateAddOutput = (): number => {

    // address input box
    if (bchaddr.isValidAddress(this.state.outputAddressValue!)) {
      this.state.txnValidationErrors!.delete(TxnErrorTypes.INVALID_OUTPUT_ADDRESS);
      if (this.state.selectedSlpTokenId !== "bch" && !bchaddr.isSlpAddress(this.state.outputAddressValue!)) {
        this.state.txnValidationErrors!.add(TxnErrorTypes.NON_SLP_ADDRESS);
      } else if (this.state.selectedSlpTokenId !== "bch") {
        this.state.txnValidationErrors!.delete(TxnErrorTypes.NON_SLP_ADDRESS);
      }
    } else {
      this.state.txnValidationErrors!.add(TxnErrorTypes.INVALID_OUTPUT_ADDRESS);
      this.state.txnValidationErrors!.delete(TxnErrorTypes.NON_SLP_ADDRESS);
    }

    // amount input box
    try {
      Big(this.state.outputAmountValue!);
      this.state.txnValidationErrors!.delete(TxnErrorTypes.INVALID_OUTPUT_AMOUNT);
    } catch (_) {
      this.state.txnValidationErrors!.add(TxnErrorTypes.INVALID_OUTPUT_AMOUNT);
    }

    const txn = this.state.currentTxn!;
    if (this.state.selectedSlpTokenId === "bch") {
      if (this.state.outputAmountValue && Big(this.state.outputAmountValue!).lt(546)) {
        this.state.txnValidationErrors!.add(TxnErrorTypes.BELOW_DUST_LIMIT);
      } else {
        this.state.txnValidationErrors!.delete(TxnErrorTypes.BELOW_DUST_LIMIT);
      }

      if (this.state.outputAmountValue) {
        const unspentAmt = Array.from(this.slpWallet.Wallet.BchCoins).reduce((p, c, i) => p.add(c[1].satoshis), Big(0))
        const outputAmt = txn.Outputs.reduce((p, c, i) => p.add(c[0].satoshis), Big(0)).add(this.state.outputAmountValue!);
        if (outputAmt.gt(unspentAmt)) {
          this.state.txnValidationErrors!.add(TxnErrorTypes.LOW_BCH_INPUTS);
        } else {
          this.state.txnValidationErrors!.delete(TxnErrorTypes.LOW_BCH_INPUTS);
        }
      } else {
        this.state.txnValidationErrors!.delete(TxnErrorTypes.LOW_BCH_INPUTS);
      }

    } else {
      this.state.txnValidationErrors!.delete(TxnErrorTypes.BELOW_DUST_LIMIT);
      this.state.txnValidationErrors!.delete(TxnErrorTypes.LOW_BCH_INPUTS);

      // check slp balance
      if (this.state.outputAmountValue!) {

        const tokenAmt = this.getTokenAmount(new Big(this.state.outputAmountValue!), this.state.selectedSlpTokenId!);

        if (this.state.outputAmountValue && tokenAmt.lt(1)) {
          this.state.txnValidationErrors!.add(TxnErrorTypes.ZERO_SLP_OUTPUT);
        } else {
          this.state.txnValidationErrors!.delete(TxnErrorTypes.ZERO_SLP_OUTPUT);
        }

        const tokenId = this.state.selectedSlpTokenId!;
        const slpCoins = this.slpWallet.Wallet.SlpCoins.get(tokenId)!;
        const unspentSlpAmt = Array.from(slpCoins).reduce((p, c, i) => p.add(c[1].amount), Big(0));
        const slpChangeAmt = this.state.currentTxn!.SlpChangeOutput ? this.state.currentTxn!.SlpChangeOutput.amount : 0;
        const outputAmt = txn.SlpOutputs.reduce((p, c, i) => p.add(c), Big(0)).add(tokenAmt).sub(slpChangeAmt);
        if (outputAmt.gt(unspentSlpAmt)) {
          this.state.txnValidationErrors!.add(TxnErrorTypes.LOW_SLP_INPUTS);
        } else {
          this.state.txnValidationErrors!.delete(TxnErrorTypes.LOW_SLP_INPUTS);
        }

        // TODO: actually check if slp change output will be needed
        const changeDust = this.state.currentTxn!.SlpChangeOutput ? DUST_LIMIT : 0;
        const opReturnSize = 10 + 32 + 9 * txn.SlpOutputs.length;

        // check for sufficient bch balance when new slp output (bch dust) is added
        const unspentBchAmt = Array.from(this.slpWallet.Wallet.BchCoins).reduce((p, c, i) => p.add(c[1].satoshis), Big(0));
        const bchChangeAmt = txn.BchChangeOutput ? txn.BchChangeOutput.amount : 0;
        const outputBchAmt = txn.Outputs.reduce((p, c, i) => p.add(c[0].satoshis), Big(0)).add(DUST_LIMIT).add(changeDust).add(opReturnSize).sub(bchChangeAmt);
        if (outputBchAmt.gt(unspentBchAmt)) {
          this.state.txnValidationErrors!.add(TxnErrorTypes.LOW_BCH_INPUTS);
        } else {
          this.state.txnValidationErrors!.delete(TxnErrorTypes.LOW_BCH_INPUTS);
        }

        // check input amount decimal places doesn't exceed
        if (tokenAmt.lt(1)) {
          this.state.txnValidationErrors!.add(TxnErrorTypes.TOO_MANY_SLP_DECIMAL_PLACES);
        } else {
          this.state.txnValidationErrors!.delete(TxnErrorTypes.TOO_MANY_SLP_DECIMAL_PLACES);
        }
      } else {
        this.state.txnValidationErrors!.delete(TxnErrorTypes.LOW_SLP_INPUTS);
        this.state.txnValidationErrors!.delete(TxnErrorTypes.LOW_BCH_INPUTS);
        this.state.txnValidationErrors!.delete(TxnErrorTypes.ZERO_SLP_OUTPUT);
        this.state.txnValidationErrors!.delete(TxnErrorTypes.TOO_MANY_SLP_DECIMAL_PLACES);
      }
    }

    if (this.state.txnValidationErrors!.size > 0) {
      this.forceUpdate();
    }

    return this.state.txnValidationErrors!.size;
  }

  private updateOutputAddress = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (bchaddr.isValidAddress(event.target.value)) {
      this.setState({ outputAddressValid: true, outputAddressValue: event.target.value });
      return;
    }
    this.setState({ outputAddressValid: false, outputAddressValue: event.target.value });
  }

  private updateSelectedToken = (event: React.ChangeEvent<HTMLSelectElement>) => {
    let tokenId = event.target.value;
    if (tokenId !== this.state.selectedSlpTokenId) {
      this.setState({ currentTxn: new TxBuilder(this.slpWallet.Wallet)})
    }
    if (event.target.selectedIndex < this.slpWallet.Wallet.TokenMetadata.size) {
      this.setState({ selectedSlpTokenId: tokenId });
    } else {
      this.setState({ selectedSlpTokenId: "bch" });
    }
  }

  private updateOutputValue = (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      Big(event.target.value);
    } catch (_) {
      this.setState({ outputAmountValid: false, outputAmountValue: event.target.value });
      return;
    }
    
    // check 
    if (Big(event.target.value).lt(546)) {
      this.setState({ outputAmountValid: false, outputAmountValue: event.target.value });
      return;
    }

    this.setState({ outputAmountValid: true, outputAmountValue: event.target.value });
  }

  private clearTransaction = () => {
    this.state.txnValidationErrors!.clear();
    this.setState({
      outputAddressValue: "",
      outputAmountValue: "",
      currentTxn: new TxBuilder(this.slpWallet.Wallet),
      selectedSlpTokenId: "bch",
    });
  }

  private sendTransaction = async () => {
    try {
      const { txnHex, fee, sendAmount } = await this.state.currentTxn!.SignTransaction(() => this.slpWallet.Wallet.PrivateKey); 
      console.log(txnHex);
      const ok = await Confirm(`Send: ${sendAmount} satoshis with fee: ${fee} satoshis?`);
      if (ok) {
        const txid = await this.slpWallet.Wallet.SendTransaction(txnHex);
        await Alert(`Broadcasted: ${txid}`);
        this.clearTransaction();
        this.forceUpdate();
      }
    } catch (err) {
      // TODO: parse various error responses for better UI
      await Alert(`Error: ${err.message}`);
    }
  }

  private setMaxAmount = () => {
    if (this.state.selectedSlpTokenId === "bch") {
      this.setState({ outputAmountValue: this.slpWallet.Wallet.GetBchBalance().toFixed() })
    } else {
      let bal = this.slpWallet.Wallet.GetSlpBalances().get(this.state.selectedSlpTokenId!)!;
      let amt = this.getTokenAmount(bal, this.state.selectedSlpTokenId!, true);
      this.setState({ outputAmountValue: amt.toFixed() });
    }
  };

  private addOutput = () => {
    if (this.validateAddOutput() > 0) {
      return;
    }

    // get address and value
    const addr = bchaddr.toCashAddress(this.state.outputAddressValue!);
    const val = Big(this.state.outputAmountValue!);

    // Add bch or slp output
    switch (this.state.selectedSlpTokenId) {
      case "bch":
        if (!this.state.currentTxn!.AddBchOutput(new Address(addr), val.toNumber())) {
          this.state.txnValidationErrors!.add(TxnErrorTypes.LOW_BCH_INPUTS);
        } else {
          this.state.txnValidationErrors!.delete(TxnErrorTypes.LOW_BCH_INPUTS);
        }
        break;
      default:
        const tokenAmt = this.getTokenAmount(val, this.state.selectedSlpTokenId!);
        this.state.currentTxn!.AddSlpOutput(addr, tokenAmt, this.state.selectedSlpTokenId!);
        break;
    }

    this.forceUpdate();
  }

  private getTokenAmount(val: Big, tokenId: string, display=false) {
    const tm = this.slpWallet.Wallet.TokenMetadata.get(tokenId)!;
    let decimals: number;
    if (tm.hasType1()) {
      decimals = tm.getType1()!.getDecimals();
    } else if (tm.hasNft1Group()) {
      decimals = tm.getNft1Group()!.getDecimals();
    } else if (tm.hasNft1Child()) {
      decimals = 0;
    } else {
      throw Error("unknown token type");
    }
    if (display) {
      return val.div(10**decimals);
    }
    return val.mul(10**decimals);
  }

  private importMnemonic = (event: React.ChangeEvent<HTMLInputElement>) => {
    const userValue = event.target.value!;
    if (!userValue) {
      return;
    }
    try {
      this.slpWallet.Wallet.UpdateMnemonic(userValue);
    } catch (_) {
      console.log(`invalid wif: ${userValue}`);
    }
    this.setState({
      address: this.slpWallet.Wallet.Address.toCashAddress(),
      showPrivKey: false,
      showSlpAddressFormat: false,
      // loading: true // TODO: provide UI indication that the wallet balances are loading.
    });

    this.slpWallet.Wallet.LoadInitialBalances();
  }

  private getTokenTicker(tokenId?: string): string {
    if (!tokenId) {
      tokenId = this.state.selectedSlpTokenId!;
    }
    if (tokenId === "bch") {
      return "satoshis";
    }
    if (!this.slpWallet.Wallet.TokenMetadata!.has(tokenId)) {
      return `?`;
    }
    const tm = this.slpWallet.Wallet.TokenMetadata!.get(tokenId)!;
    let nameBuf: Uint8Array;
    if (tm.hasType1()) {
      nameBuf = tm.getType1()!.getTokenTicker_asU8();
    } else if (tm.hasNft1Group()) {
      nameBuf = tm.getNft1Group()!.getTokenTicker_asU8();
    } else if (tm.hasNft1Child()) {
      nameBuf = tm.getNft1Child()!.getTokenTicker_asU8();
    } else {
      throw Error("unknown token type");
    }
    return Buffer.from(nameBuf).toString("utf8");
  }

  private getTokenName(tokenId: string): string {
    if (tokenId === "bch") {
      return "Bitcoin Cash"
    }
    if (!this.slpWallet.Wallet.TokenMetadata!.has(tokenId)) {
      return `${tokenId.slice(0, 10)}...${tokenId.slice(54, 64)}`;
    }
    const tm = this.slpWallet.Wallet.TokenMetadata!.get(tokenId)!;
    let nameBuf: Uint8Array;
    if (tm.hasType1()) {
      nameBuf = tm.getType1()!.getTokenName_asU8();
    } else if (tm.hasNft1Group()) {
      nameBuf = tm.getNft1Group()!.getTokenName_asU8();
    } else if (tm.hasNft1Child()) {
      nameBuf = tm.getNft1Child()!.getTokenName_asU8();
    } else {
      throw Error("unknown token type");
    }
    return Buffer.from(nameBuf).toString("utf8");
  }

  private getTokenTypeString(tokenId: string): string {
    const tm = this.slpWallet.Wallet.TokenMetadata.get(tokenId);
    if (!tm) {
      return "?";
    }
    switch (tm.getTypeMetadataCase()) {
      case TokenMetadata.TypeMetadataCase.TYPE1:
        return "Token";
      case TokenMetadata.TypeMetadataCase.NFT1_GROUP:
        return "NFT Group";
      case TokenMetadata.TypeMetadataCase.NFT1_CHILD:
        return "NFT";
      default:
        return "?";
    }
  }

  private getSlpAmountString(amount: Big, tokenId?: string): string {
    if (!tokenId) {
      tokenId = this.state.selectedSlpTokenId!;
    }
    const tm = this.slpWallet.Wallet.TokenMetadata!.get(tokenId)!;
    // if (!tm) {
    //   return "...";
    // }
    let decimals: number;
    if (tm.hasType1()) {
      decimals = tm.getType1()!.getDecimals();
    } else if (tm.hasNft1Group()) {
      decimals = tm.getNft1Group()!.getDecimals();
    } else if (tm.hasNft1Child()) {
      decimals = 0;
    } else {
      throw Error("unknown token type");
    }
    return amount.div(10 ** decimals).toFixed();
  }

  private toggleAddrFormat = async () => {
    let address = this.slpWallet.Wallet.Address.toCashAddress();
    if (!this.state.showSlpAddressFormat) {
      address = bchaddr.toSlpAddress(address);
    }
    if (!this.state.useMainnet) {
      address = bchaddr.toTestnetAddress(address);
    }
    await this.setState({
      showSlpAddressFormat: !this.state.showSlpAddressFormat,
      address,
    });
  }

  private toggleMnemonic = () => {
    this.setState({
      showPrivKey: !this.state.showPrivKey
    });
  }

}

export default App;
