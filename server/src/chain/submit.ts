import { MsgExecuteContract } from "@injectivelabs/sdk-ts";
import { getChainBroadcaster, getContractAddress } from "./index";

export interface SubmitResultParams {
  matchId: string;
  winner: string; // cosmos address
  multiplier: 1 | 2 | 3;
  gameHash: string; // 64-char hex
}

export async function submitResult(
  params: SubmitResultParams,
): Promise<string> {
  const { broadcaster, address } = getChainBroadcaster();
  const contractAddress = getContractAddress();

  const msg = MsgExecuteContract.fromJSON({
    sender: address,
    contractAddress,
    msg: {
      submit_result: {
        match_id: params.matchId,
        winner: params.winner.trim(),
        multiplier: params.multiplier,
        game_hash: params.gameHash,
        evidence_hash: null,
      },
    },
  });

  const result = await broadcaster.broadcast({ msgs: msg });

  const txHash = result.txHash || "";
  console.log(`[Chain] SubmitResult tx: ${txHash}`);
  return txHash;
}
