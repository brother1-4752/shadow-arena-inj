import { useCallback } from "react";
import {
  MsgExecuteContract,
  BaseAccount,
  ChainRestAuthApi,
  createTransaction,
  TxRestApi,
  createTxRawFromSigResponse,
} from "@injectivelabs/sdk-ts";

const DEFAULT_STD_FEE = {
  amount: [{ denom: "inj", amount: "500000000000000" }],
  gas: "400000",
};

const CONTRACT_ADDRESS = (
  import.meta.env.VITE_CONTRACT_ADDRESS ||
  "inj1kqqdhujw0tvmwa5z83z62hfqza5uhkpfrajvfp"
).trim();
const CHAIN_ID = "injective-888";
const REST_ENDPOINT = "https://testnet.sentry.lcd.injective.network:443";

async function broadcastTx(senderAddress: string, msgs: MsgExecuteContract[]) {
  if (!window.keplr) throw new Error("Keplr not available");

  const chainRestAuthApi = new ChainRestAuthApi(REST_ENDPOINT);
  const accountDetailsResponse =
    await chainRestAuthApi.fetchAccount(senderAddress);
  const baseAccount = BaseAccount.fromRestApi(accountDetailsResponse);

  const offlineSigner = window.keplr.getOfflineSigner(CHAIN_ID);
  const accounts = await offlineSigner.getAccounts();
  const pubKey = btoa(
    String.fromCharCode(...new Uint8Array(accounts[0].pubkey)),
  );

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

  const txRaw = createTxRawFromSigResponse(directSignResponse);
  const txRestApi = new TxRestApi(REST_ENDPOINT);

  let txResponse: any;
  try {
    txResponse = await txRestApi.broadcast(txRaw);
  } catch (broadcastErr: any) {
    console.error("[Contract] Broadcast threw:", broadcastErr);
    // Try to extract useful info from the error
    const detail =
      broadcastErr?.response?.data?.tx_response?.raw_log ||
      broadcastErr?.message ||
      String(broadcastErr);
    throw new Error(detail);
  }

  // Log full response for debugging
  console.log("[Contract] Broadcast response:", JSON.stringify(txResponse));

  // Check for execution errors in raw_log/rawLog
  const rawLog =
    (txResponse as any).rawLog ||
    (txResponse as any).raw_log ||
    (txResponse as any).txResponse?.rawLog ||
    (txResponse as any).txResponse?.raw_log ||
    "";
  const code =
    (txResponse as any).code ||
    (txResponse as any).txResponse?.code;
  if (code && code !== 0) {
    throw new Error(rawLog || `Transaction failed with code ${code}`);
  }

  return (txResponse as any).txHash || (txResponse as any).txhash || "";
}

export interface UseContractReturn {
  fundMatch: (
    matchId: string,
    amount: string,
    denom: string,
  ) => Promise<string>;
  confirmResult: (matchId: string) => Promise<string>;
  claim: (matchId: string) => Promise<string>;
  cancelUnfunded: (matchId: string) => Promise<string>;
  updateConfig: (serverAuthority: string) => Promise<string>;
}

export function useContract(address: string | null): UseContractReturn {
  const fundMatch = useCallback(
    async (matchId: string, amount: string, denom: string) => {
      if (!address) throw new Error("Wallet not connected");

      const msg = MsgExecuteContract.fromJSON({
        sender: address,
        contractAddress: CONTRACT_ADDRESS,
        msg: { fund_match: { match_id: matchId } },
        funds: [{ denom, amount }],
      });

      return broadcastTx(address, [msg]);
    },
    [address],
  );

  const confirmResult = useCallback(
    async (matchId: string) => {
      if (!address) throw new Error("Wallet not connected");

      const msg = MsgExecuteContract.fromJSON({
        sender: address,
        contractAddress: CONTRACT_ADDRESS,
        msg: { confirm_result: { match_id: matchId } },
      });

      return broadcastTx(address, [msg]);
    },
    [address],
  );

  const claim = useCallback(
    async (matchId: string) => {
      if (!address) throw new Error("Wallet not connected");

      const msg = MsgExecuteContract.fromJSON({
        sender: address,
        contractAddress: CONTRACT_ADDRESS,
        msg: { claim: { match_id: matchId } },
      });

      return broadcastTx(address, [msg]);
    },
    [address],
  );

  const cancelUnfunded = useCallback(
    async (matchId: string) => {
      if (!address) throw new Error("Wallet not connected");

      const msg = MsgExecuteContract.fromJSON({
        sender: address,
        contractAddress: CONTRACT_ADDRESS,
        msg: { cancel_unfunded: { match_id: matchId } },
      });

      return broadcastTx(address, [msg]);
    },
    [address],
  );

  const updateConfig = useCallback(
    async (serverAuthority: string) => {
      if (!address) throw new Error("Wallet not connected");

      const msg = MsgExecuteContract.fromJSON({
        sender: address,
        contractAddress: CONTRACT_ADDRESS,
        msg: {
          update_config: {
            server_authority: serverAuthority,
          },
        },
      });

      return broadcastTx(address, [msg]);
    },
    [address],
  );

  return { fundMatch, confirmResult, claim, cancelUnfunded, updateConfig };
}
