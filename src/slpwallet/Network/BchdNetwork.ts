import { BlockNotification, GetAddressTransactionsResponse, GetTokenMetadataResponse,
  GetTransactionResponse, GrpcClient, Transaction, TransactionNotification } from "grpc-bchrpc-web";
import Utils from "../Utils";

export interface Network {
  SendTransaction(txnHex: string, callback?: () => any): Promise<string>;
  GetTransaction(txid: string): Promise<GetTransactionResponse>;
  GetTokenMetadata(tokenIds: string[]): Promise<GetTokenMetadataResponse>;
  GetAddressTransactions(address: string, sinceBlock?: number): Promise<GetAddressTransactionsResponse>;
  Subscribe(addresses: string[], onTransactionNotification: (txn: Transaction) => any): Promise<void>;
}

export class BchdNetwork implements Network {

  private networkUrl: string;
  private subscriptions = { txn: false, blockInfo: false, blockData: false };
  private blockHeight = -1;

  constructor(url: string) {
    this.networkUrl = url;
  }

  public async SendTransaction(txnHex: string, callback?: () => any): Promise<string> {
    const client = new GrpcClient({ url: this.networkUrl });
    let res = await client.submitTransaction({txnHex});
    if (callback) {
      callback();
    }
    return Buffer.from(res.getHash_asU8().reverse()).toString("hex");
  }

  public async GetTransaction(txid: string) {
    const client = new GrpcClient({ url: this.networkUrl });
    return await client.getTransaction({hash: txid, reversedHashOrder: true}); 
  }

  public async GetTokenMetadata(tokenIds: string[]) {
    const client = new GrpcClient({url: this.networkUrl});
    return await client.getTokenMetadata(tokenIds);
  }

  public async GetAddressTransactions(address: string, sinceBlock?: number) {
    const client = new GrpcClient({ url: this.networkUrl });
    const slpEnabled = (await client.getBlockchainInfo()).getSlpIndex();
    if (! slpEnabled) {
      throw Error("connected bchd does not have slp index enabled");
    }

    return await client.getAddressTransactions({ address });
  }

  public async Subscribe(addresses: string[], onTransactionNotification: (txn: Transaction) => any) {

    // setup a self-healing stream for mempool transactions
    const createTxnStream = async () => {
      if (this.subscriptions.txn) {
        console.log("Txn stream already connected");
        return;
      }
      const client = new GrpcClient({ url: this.networkUrl });
      const txnStream = await client.subscribeTransactions({
        includeMempoolAcceptance: true,
        includeBlockAcceptance: false,
        includeSerializedTxn: false,
        addresses: addresses
      });

      txnStream.on("end", async (error) => {
        this.subscriptions.txn = false;
        while (true) {
          await Utils.sleep(500);
          try {
            console.log(`[WALLET] trying to re-establish txn data stream...`);
            await createTxnStream();
            break;
          } catch (error) {
            console.log(error);
          }
        }
      });

      txnStream.on("data", async (data: TransactionNotification) => {
        this.subscriptions.txn = true;
        let txn = data.getUnconfirmedTransaction()!.getTransaction()!;
        onTransactionNotification(txn);
      });
      console.log(`[WALLET] txn data stream established.`);

    };
    await createTxnStream();

    // setup a self-healing stream for getting serialized block data
    const createBlockDataStream = async () => {
      if (this.subscriptions.blockData) {
        console.log("Txn stream already connected");
        return;
      }
      const client = new GrpcClient({ url: this.networkUrl });
      const blockDataStream = await client.subscribeBlocks({ includeSerializedBlock: true });
      blockDataStream.on("end", async (error) => {
        this.subscriptions.blockData = false;
        while (true) {
          await Utils.sleep(500);
          try {
            console.log(`[WALLET] trying to re-establish block data stream...`);
            await createBlockDataStream();
            break;
          } catch (_) {}
        }
      });
      blockDataStream.on("data", async (data: BlockNotification) => {
        this.subscriptions.blockData = true;
        // const blockBuf = Buffer.from(data.getSerializedBlock_asU8());
        // const block = new Block(blockBuf);
        console.log("BLOCK found");
        // for (const txn of block.transactions) {
        //   // todo...
          
        // }
      });
      console.log(`[WALLET] block data stream established.`);
    };
    await createBlockDataStream();

    // setup a self-healing stream for getting block height
    const createBlockInfoStream = async () => {
      if (this.subscriptions.blockInfo) {
        console.log("Txn stream already connected");
        return;
      }
      const client = new GrpcClient({ url: this.networkUrl });
      const blockInfoStream = await client.subscribeBlocks();
      blockInfoStream.on("end", async (error) => {
        this.subscriptions.blockInfo = false;
        while (true) {
          await Utils.sleep(500);
          try {
            console.log(`[WALLET] trying to re-establish block info stream...`);
            await createBlockInfoStream();
            break;
          } catch (_) {}
        }
      });
      blockInfoStream.on("data", async (data: BlockNotification) => {
        this.subscriptions.blockInfo = true;
        const height = data.getBlockInfo()!.getHeight();
        this.blockHeight = height;
        console.log(`Block found: ${height}`);
      });
      console.log(`[WALLET] block info stream established.`);
    };
    await createBlockInfoStream();
  }
}
