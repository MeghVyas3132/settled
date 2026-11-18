import { initiateDappRelay } from '@wizardconnect/core';
import { sourceOutputToRelay } from '@wizardconnect/core/hdwalletv1-serialize';
import { DappConnectionManager } from '@wizardconnect/dapp';
import {
  binToHex, cashAddressToLockingBytecode, decodeTransaction, encodeTransaction, hash160, hexToBin,
  lockingBytecodeToCashAddress,
} from '@bitauth/libauth';
import type { Coin } from './api';

const RECEIVE = 0;
const CHANGE = 1;
const SCAN = { receive: 20, change: 10 };

export interface WalletAddress { address: string; branch: 'receive' | 'change'; index: number; lockingBytecode: Uint8Array }

function p2pkh(pubkey: Uint8Array): Uint8Array {
  return Uint8Array.from([0x76, 0xa9, 0x14, ...hash160(pubkey), 0x88, 0xac]);
}

/** WizardConnect session for a payer wallet (Cashonize, Paytaca, Selene). */
export class WizardWallet {
  dapp = new DappConnectionManager('Settled', `${location.origin}/icon.svg`);
  private relay = initiateDappRelay((p) => this.dapp.updateConnection(p.client, p.status));
  addresses: WalletAddress[] = [];
  walletName = '';

  get uri(): string {
    return this.relay.uri;
  }

  onReady(cb: () => void) {
    this.dapp.on('walletready', (m: any) => {
      this.walletName = m.wallet_name ?? 'wallet';
      this.addresses = [];
      for (const [branch, child, n] of [['receive', RECEIVE, SCAN.receive], ['change', CHANGE, SCAN.change]] as const) {
        for (let i = 0; i < n; i++) {
          const pk = this.dapp.getPubkey(child, BigInt(i));
          if (!pk) continue;
          const lockingBytecode = p2pkh(pk);
          const a = lockingBytecodeToCashAddress({ bytecode: lockingBytecode, prefix: 'bitcoincash' });
          if (typeof a === 'string') continue;
          this.addresses.push({ address: a.address, branch, index: i, lockingBytecode });
        }
      }
      cb();
    });
  }

  onDisconnect(cb: () => void) {
    this.dapp.on('disconnect', () => cb());
  }

  /**
   * Builds a payment that spends only the given coins, asks the wallet to sign it, checks the
   * wallet returned the same payment, and returns the signed hex (not yet broadcast).
   */
  async pay(coins: Coin[], to: string, amount: number): Promise<string> {
    const dest = cashAddressToLockingBytecode(to);
    if (typeof dest === 'string') throw new Error(`bad merchant address: ${dest}`);
    const total = coins.reduce((s, c) => s + c.value, 0);
    const fee = 10 + 148 * coins.length + 34 * 2 + 10;
    const change = total - amount - fee;
    if (change < 0) throw new Error('not enough funds in the selected coins');
    const changeAddr = this.addresses.find((a) => a.branch === 'change' && a.index === 0) ?? this.addresses[0]!;
    const outputs = [{ lockingBytecode: dest.bytecode, valueSatoshis: BigInt(amount) }];
    if (change >= 546) outputs.push({ lockingBytecode: changeAddr.lockingBytecode, valueSatoshis: BigInt(change) });

    const inputs = coins.map((c) => ({
      outpointTransactionHash: hexToBin(c.txid),
      outpointIndex: c.vout,
      sequenceNumber: 0xffffffff,
      unlockingBytecode: new Uint8Array(),
    }));
    const tx = { version: 2, locktime: 0, inputs, outputs };
    const sourceOutputs = coins.map((c, i) => {
      const owner = this.addresses.find((a) => a.address === c.address)!;
      return sourceOutputToRelay({ ...inputs[i]!, lockingBytecode: owner.lockingBytecode, valueSatoshis: BigInt(c.value) } as any);
    });
    const inputPaths = coins.map((c, i) => {
      const owner = this.addresses.find((a) => a.address === c.address)!;
      return [i, owner.branch, owner.index] as [number, string, number];
    });

    const res: any = await this.dapp.signTransaction({
      transaction: { transaction: binToHex(encodeTransaction(tx)), sourceOutputs, userPrompt: `Pay ${amount} sats`, broadcast: false } as any,
      inputPaths: inputPaths as any,
    });
    const signedHex: string = res.signedTransaction ?? res.transaction ?? res;
    // Never trust the wallet blindly: the signed tx must pay exactly what we asked.
    const signed = decodeTransaction(hexToBin(signedHex));
    if (typeof signed === 'string') throw new Error('wallet returned an unreadable transaction');
    const paysMerchant = signed.outputs.some((o) => binToHex(o.lockingBytecode) === binToHex(dest.bytecode) && o.valueSatoshis === BigInt(amount));
    const sameInputs = signed.inputs.length === inputs.length &&
      signed.inputs.every((s, i) => binToHex(s.outpointTransactionHash) === binToHex(inputs[i]!.outpointTransactionHash) && s.outpointIndex === inputs[i]!.outpointIndex);
    if (!paysMerchant || !sameInputs) throw new Error('wallet returned a different transaction than requested');
    return signedHex;
  }

  async disconnect() {
    await this.dapp.sendDisconnect('bye').catch(() => {});
    this.relay.cleanup();
  }
}
