import { getChainClient, getContractAddress } from "./index";

export interface SubmitResultParams {
  matchId: string;
  winner: string; // cosmos address
  multiplier: 1 | 2 | 3;
  gameHash: string; // 64-char hex
}

export async function submitResult(
  params: SubmitResultParams,
): Promise<string> {
  const { client, address } = await getChainClient();
  const contractAddress = getContractAddress();

  const msg = {
    submit_result: {
      match_id: params.matchId,
      winner: params.winner,
      multiplier: params.multiplier,
      game_hash: params.gameHash,
      evidence_hash: null,
    },
  };

  const result = await client.execute(address, contractAddress, msg, "auto");

  console.log(`[Chain] SubmitResult tx: ${result.transactionHash}`);
  return result.transactionHash;
}
