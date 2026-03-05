import { MsgExecuteContract } from "@injectivelabs/sdk-ts";
import { getChainBroadcaster, getContractAddress } from "./index";

export interface CreateMatchParams {
  matchId: string;
  playerA: string; // cosmos address
  playerB: string; // cosmos address
  stake: string; // e.g. "1000000000000000" (0.001 INJ)
  denom: string; // e.g. "inj"
}

export async function createMatch(params: CreateMatchParams): Promise<string> {
  const { broadcaster, address } = getChainBroadcaster();
  const contractAddress = getContractAddress().trim();
  const playerA = params.playerA.trim();
  const playerB = params.playerB.trim();

  console.log(`[Chain] CreateMatch debug: contract=${JSON.stringify(contractAddress)} playerA=${JSON.stringify(playerA)} playerB=${JSON.stringify(playerB)}`);

  const msg = MsgExecuteContract.fromJSON({
    sender: address,
    contractAddress,
    msg: {
      create_match: {
        match_id: params.matchId,
        player_a: playerA,
        player_b: playerB,
        stake: params.stake,
        denom: params.denom,
      },
    },
  });

  const result = await broadcaster.broadcast({ msgs: msg });

  const txHash = result.txHash || "";
  console.log(`[Chain] CreateMatch tx: ${txHash}`);
  return txHash;
}
