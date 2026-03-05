import { useCallback } from 'react';
import {
  MsgExecuteContract,
  BaseAccount,
  ChainRestAuthApi,
  createTransaction,
  TxRestClient,
  getTxRawFromTxRawOrDirectSignResponse,
} from '@injectivelabs/sdk-ts';
import { BigNumberInBase } from '@injectivelabs/utils';
import { DEFAULT_STD_FEE } from '@injectivelabs/utils';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || 'inj1kqqdhujw0tvmwa5z83z62hfqza5uhkpfrajvfp';
const CHAIN_ID = 'injective-888';
const REST_ENDPOINT = 'https://testnet.sentry.lcd.injective.network:443';

async function broadcastTx(senderAddress: string, msgs: MsgExecuteContract[]) {
  if (!window.keplr) throw new Error('Keplr not available');

  const chainRestAuthApi = new ChainRestAuthApi(REST_ENDPOINT);
  const accountDetailsResponse = await chainRestAuthApi.fetchAccount(senderAddress);
  const baseAccount = BaseAccount.fromRestApi(accountDetailsResponse);

  const offlineSigner = window.keplr.getOfflineSigner(CHAIN_ID);
  const accounts = await offlineSigner.getAccounts();
  const pubKey = Buffer.from(accounts[0].pubkey).toString('base64');

  const { signDoc } = createTransaction({
    pubKey,
    chainId: CHAIN_ID,
    fee: DEFAULT_STD_FEE,
    message: msgs,
    sequence: baseAccount.sequence,
    accountNumber: baseAccount.accountNumber,
  });

  const directSignResponse = await offlineSigner.signDirect(
    senderAddress,
    signDoc,
  );

  const txRaw = getTxRawFromTxRawOrDirectSignResponse(directSignResponse);
  const txRestClient = new TxRestClient(REST_ENDPOINT);
  const txResponse = await txRestClient.broadcast(txRaw);

  if (txResponse.code !== 0) {
    throw new Error(`Transaction failed: ${txResponse.rawLog}`);
  }

  return txResponse.txHash;
}

export interface UseContractReturn {
  fundMatch: (matchId: string, amount: string, denom: string) => Promise<string>;
  confirmResult: (matchId: string) => Promise<string>;
  claim: (matchId: string) => Promise<string>;
}

export function useContract(address: string | null): UseContractReturn {
  const fundMatch = useCallback(async (matchId: string, amount: string, denom: string) => {
    if (!address) throw new Error('Wallet not connected');

    const msg = MsgExecuteContract.fromJSON({
      sender: address,
      contractAddress: CONTRACT_ADDRESS,
      msg: { fund_match: { match_id: matchId } },
      funds: [{ denom, amount }],
    });

    return broadcastTx(address, [msg]);
  }, [address]);

  const confirmResult = useCallback(async (matchId: string) => {
    if (!address) throw new Error('Wallet not connected');

    const msg = MsgExecuteContract.fromJSON({
      sender: address,
      contractAddress: CONTRACT_ADDRESS,
      msg: { confirm_result: { match_id: matchId } },
    });

    return broadcastTx(address, [msg]);
  }, [address]);

  const claim = useCallback(async (matchId: string) => {
    if (!address) throw new Error('Wallet not connected');

    const msg = MsgExecuteContract.fromJSON({
      sender: address,
      contractAddress: CONTRACT_ADDRESS,
      msg: { claim: { match_id: matchId } },
    });

    return broadcastTx(address, [msg]);
  }, [address]);

  return { fundMatch, confirmResult, claim };
}
