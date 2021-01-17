import { Component } from "react";
import "./App.css";
import logo from "./logo.svg";

import bchaddr from "bchaddrjs-slp";
import { Big } from "big.js";
import QRCode from "qrcode.react";
import { Wallet } from "./Wallet";

interface IProps {}

interface IState {
  showPrivKey?: boolean;
  showSlpAddressFormat?: boolean;
  useMainnet?: boolean;
  address?: string;
  checkingBalance?: boolean;
}

class App extends Component<IProps, IState> {
  public wallet = new Wallet(this);
  private mounted = false;

  constructor(props: IProps) {
    super(props);

    this.state = {
      showPrivKey: false,
      showSlpAddressFormat: false,
      address: this.wallet.Address,
      useMainnet: true,
      checkingBalance: true
    };
  }

  public componentDidMount() {
    this.mounted = true;
  }

  public Redraw() {
    if (this.mounted) {
      this.forceUpdate();
    }
  }

  public render() {
    return (
      <div className="App">
        <header className="App-header">
          <h1>A Bitcoin Cash Browser Wallet.</h1><br/>

          {/* TODO: Dropdown to select wallet type single WIF or HD path */}

          {/* Display private key backup! */}
          <br/><br/>
          <strong>Back up your funds with your 12-word seed phase!!!</strong><br/>
          <p hidden={!this.state.showPrivKey}>
            Seed Phrase:<br/><input defaultValue={this.wallet.Mnemonic} onChange={this.importMnemonic}/>
          </p>
          <button
            onClick={this.toggleMnemonic}
          >
            {this.state.showPrivKey ? "Hide" : "Show"} Seed Phrase
          </button>

          {/* Display network mode */}
          {/* <p>
            <strong>BCHD Network:</strong><br/>
            {this.state.useMainnet ? "Mainnet" : "Testnet3" }<br/>
            ({this.wallet.NetworkUrl})<br/>
            <button
              onClick={this.toggleNetwork}
            >
              Switch to {this.state.useMainnet ? "testnet3" : "mainnet" }
            </button>
          </p> */}

          {/* Display address */}
          <p>
            <strong>Your wallet address:</strong><br/>
            {this.state.address}
          </p>
          <QRCode value={this.state.address!} />

          {/* Display address format */}
          <p>
            <strong>Address Format:</strong><br/>
            {this.state.showSlpAddressFormat ? "SLP" : "BCH"}<br/>
            <button
            onClick={this.toggleAddrFormat}
            >
            Switch to {this.state.showSlpAddressFormat ? "cash" : "slp" }Addr format
          </button>
          </p>

          {/* Display BCH balance */}
          <p>
            <strong>Bitcoin Cash Balance:</strong><br/>
            {this.wallet.GetBchBalance().toFixed()} sats
          </p>

          {/* Display SLP token balances */}
          <div hidden={this.wallet.SlpCoins.size === 0}>
            <strong>SLP Token Balances:</strong><br/>
            <table>
              <thead key="thead"><tr><th>name</th><th>amount</th></tr></thead>
              <tbody key="tbody">
              {
                Array.from(this.wallet.GetSlpBalances()).map(b => {
                  return (<tr key={b[0]}><td>{this.getTokenName(b[0])}</td><td>{this.getSlpAmountString(b[0], b[1])}</td></tr>);
                })
              }
              </tbody>
            </table>
          </div>
          <p hidden={this.wallet.SlpCoins!.size !== 0}>
            No SLP token balances.
          </p>

          {/* TODO: Coin Control */}

          {/* TODO: Send */}

          {/* Learn more about BCH! */}
          <br/><br/>
          <a
            className="App-link"
            href="https://bch.info"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more about Bitcoin Cash<br/>
            <img src={logo} className="App-logo" alt="logo" width="30%" height="30%"/>
          </a>
        </header>
      </div>
    );
  }

  public setState(state: IState) {
    return new Promise((resolve: any) => {
      super.setState(state, resolve);
    });
  }

  // public componentDidMount() {
  //   this.UpdateBalances();
  // }

  private importMnemonic = (event: React.SyntheticEvent<HTMLInputElement, Event>) => {

    // @ts-ignore
    const userValue = event.target.value!;

    if (!userValue) {
      return;
    }

    try {
      this.wallet.UpdateMnemonic(userValue);
    } catch (_) {
      console.log(`invalid wif: ${userValue}`);
    }

    this.setState({
      address: this.wallet.Address,
      showPrivKey: false,
      showSlpAddressFormat: false,
      // loading: true // TODO: provide UI indication that the wallet balances are loading.
    });

    this.wallet.UpdateBalances(() => this.forceUpdate());
  }

  private getTokenName(tokenId: string): string {
    if (!this.wallet.TokenMetadata!.has(tokenId)) {
      return `${tokenId.slice(0, 10)}...${tokenId.slice(54, 64)}`;
    }
    const tm = this.wallet.TokenMetadata!.get(tokenId)!;
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

  private getSlpAmountString(tokenId: string, amount: Big): string {
    const tm = this.wallet.TokenMetadata!.get(tokenId)!;
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
  private toggleNetwork = () => {
    let address = this.state.address!;
    if (!this.state.useMainnet) {
      address = bchaddr.toMainnetAddress(address);
    } else {
      address = bchaddr.toTestnetAddress(address);
    }

    this.setState({
      address,
      useMainnet: !this.state.useMainnet,
    });

    this.wallet.UpdateBalances(() => this.forceUpdate());
  };

  private toggleAddrFormat = async () => {
    let address = this.wallet.Address;
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
