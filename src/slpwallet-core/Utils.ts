

export class Utils {
  // this prevents us from getting into trouble with the reverse() function
  public static hashToTxid(hash: Uint8Array): string {
    const hashHex = Buffer.from(hash).toString("hex");
    const txid = new Uint8Array(hashHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))).reverse();
    return Buffer.from(txid).toString("hex");
  }

  public static outpointToKey(hash: Uint8Array, index: number, isTxid=false): string {
    const indexBuf = Buffer.alloc(4);
    indexBuf.writeUInt32BE(index);
    if (!isTxid) {
      return Utils.hashToTxid(hash) + indexBuf.toString("hex");
    }
    return Buffer.from(hash).toString("hex") + indexBuf.toString("hex");
  }

  public static keyToOutpointString(outpoint: string): string {
    const txid = outpoint.slice(0, 64);
    const vout = outpoint.slice(64, 72);
    const voutBuf = Buffer.from(vout, "hex");
    return `${txid}:${voutBuf.readUInt32BE(0)}`;
  }

  public static sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
}

export default Utils;
