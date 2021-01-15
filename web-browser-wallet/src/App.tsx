import { Component } from "react";
import "./App.css";
import logo from "./logo.svg";

import bchaddr from "bchaddrjs-slp";
import { Big } from "big.js";
import { PrivateKey } from "bitcore-lib-cash";
import { GrpcClient, TokenMetadata, UnspentOutput } from "grpc-bchrpc-web";
import QRCode from "qrcode.react";

interface IProps {}

type tokenId = string;
type outpoint = string;

interface IState {
  showPrivKey?: boolean;
  showSlpAddressFormat?: boolean;
  useMainnet?: boolean;
  address?: string;
  checkingBalance?: boolean;
  networkUrl?: string;
  bchCoins?: Map<outpoint, Big>;
  slpCoins?: Map<tokenId, Map<outpoint, Big>>;
  tokenMetadata?: Map<tokenId, TokenMetadata>;
}

class App extends Component<IProps, IState> {
  public pk: PrivateKey;

  constructor(props: IProps) {
    super(props);

    // setup our bitcore-fun browser wallet...
    if (localStorage.getItem("bitcore-fun-wif") == null) {
      this.pk = new PrivateKey();
      localStorage.setItem("bitcore-fun-wif", this.pk.toWIF());
    } else {
      this.pk = new PrivateKey(localStorage.getItem("bitcore-fun-wif")!);
    }

    this.state = {
      showPrivKey: false,
      showSlpAddressFormat: false,
      address: this.pk.toAddress().toCashAddress(),
      useMainnet: true,
      checkingBalance: true,
      networkUrl: "https://bchd.ny1.simpleledger.io",
      bchCoins: new Map<outpoint, Big>(),
      slpCoins: new Map<tokenId, Map<tokenId, Big>>(),
      tokenMetadata: new Map<tokenId, TokenMetadata>()
    };
  }

  public render() {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Browser Wallet Example</h1><br/>

          {/* Display private key backup! */}
          <br/><br/>
          <strong>Don't forget to copy your Private Key!!!</strong><br/>
          <p hidden={!this.state.showPrivKey}>
            Private key (WIF):<br/><input defaultValue={this.pk.toWIF()} onChange={this.importWif}/>
          </p>
          <button
            onClick={this.toggleWif}
          >
            {this.state.showPrivKey ? "Hide" : "Show"} Private Key (WIF)
          </button>

          {/* Display network mode */}
          <p>
            <strong>Network:</strong><br/>
            {this.state.useMainnet ? "Mainnet" : "Testnet3" }<br/>
            <button
              onClick={this.toggleNetwork}
            >
            Switch to {this.state.useMainnet ? "testnet3" : "mainnet" }
          </button>
          </p>

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
            {this.getBchBalance().toFixed()} sats
          </p>

          {/* Display SLP token balances */}
          <p hidden={this.state.slpCoins!.size === 0}>
            <strong>SLP Token Balances:</strong><br/>
            <table>
              <tr><th>name</th><th>amount</th></tr>
              {Array.from(this.getSlpBalances()).map(b => {
                return (<tr><td>{this.getTokenName(b[0])}</td><td>{this.getSlpAmountString(b[0], b[1])}</td></tr>);
              })}
            </table>
          </p>
          <p hidden={this.state.slpCoins!.size !== 0}>
            No SLP token balances.
          </p>

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

  public componentDidMount() {
    this.updateBalances();
  }

  public async updateBalances() {
    const client = new GrpcClient({url: this.state.networkUrl });
    const res = await client.getAddressUtxos({
      address: this.state.address!,
      includeMempool: true,
      includeTokenMetadata: true
    });

    const bchCoins = this.state.bchCoins!;
    const slpCoins = this.state.slpCoins!;
    res.getOutputsList().forEach((o) => {
      const op = this.outpointToKey(o);
      if (o.hasSlpToken()) {
        const _tokenId = Buffer.from(o.getSlpToken()!.getTokenId_asU8()).toString("hex");
        if (! slpCoins.has(_tokenId)) {
          slpCoins.set(_tokenId, new Map<outpoint, Big>());
        }
        slpCoins.get(_tokenId)!.set(op, Big(o.getSlpToken()!.getAmount()));
      } else {
        bchCoins.set(op, Big(o.getValue()));
      }
    });

    res.getTokenMetadataList().forEach(t => {
        this.state.tokenMetadata!.set(Buffer.from(t.getTokenId_asU8()).toString("hex"), t);
    });

    await this.setState({
      bchCoins,
      slpCoins,
    });
  }

  importWif = (event: React.SyntheticEvent<HTMLInputElement, Event>) => {

    // @ts-ignore
    const userValue = event.target.value!;

    if (!userValue) {
      return;
    }

    try {
      this.pk = new PrivateKey(userValue);
    } catch (_) {
      console.log(`invalid wif: ${userValue}`);
    }

    localStorage.setItem("bitcore-fun-wif", this.pk.toWIF());
    this.setState({
      address: this.pk.toAddress().toCashAddress(),
      showPrivKey: false,
      showSlpAddressFormat: false,
      // loading: true // TODO: provide UI indication that the wallet balances are loading.
    });

    this.updateBalances();
  }

  private getTokenName(tokenId: string): string {
    if (!this.state.tokenMetadata!.has(tokenId)) {
      return `${tokenId.slice(0, 10)}...${tokenId.slice(54, 64)}`;
    }
    const tm = this.state.tokenMetadata!.get(tokenId)!;
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
    const tm = this.state.tokenMetadata!.get(tokenId)!;
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

  private outpointToKey(output: UnspentOutput): string {
    const index = Buffer.alloc(4);
    index.writeUInt32LE(output.getOutpoint()!.getIndex());
    return Buffer.from(output.getOutpoint()!.getHash_asU8()).toString("hex") + index.toString("hex");
  }

  private getBchBalance(): Big {
    return Array.from(this.state.bchCoins!).reduce((p, c) => p.add(c[1]), Big(0));
  }

  private getSlpBalances(): Map<tokenId, Big> {
    const slpBals = new Map<tokenId, Big>();
    Array.from(this.state.slpCoins!).forEach(coins => {
      slpBals.set(coins[0], Array.from(coins[1]).reduce((p, c) => p.add(c[1]), Big(0)));
    });
    return slpBals;
  }

  private toggleNetwork = () => {
    let address = this.state.address!;
    if (!this.state.useMainnet) {
      address = bchaddr.toMainnetAddress(address);
    } else {
      address = bchaddr.toTestnetAddress(address);
    }
    this.setState({
      useMainnet: !this.state.useMainnet,
      address
    });
  }

  private toggleAddrFormat = async () => {
    let address = this.pk.toAddress().toCashAddress();
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

  private toggleWif = () => {
    this.setState({
      showPrivKey: !this.state.showPrivKey
    });
  }

}

export default App;
