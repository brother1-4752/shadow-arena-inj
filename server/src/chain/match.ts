import { getChainClient, getContractAddress } from "./index";

export interface CreateMatchParams {
  matchId: string;
  playerA: string; // cosmos address
  playerB: string; // cosmos address
  stake: string; // e.g. "1000000000000000000" (1 INJ in aINJ)
  denom: string; // e.g. "inj"
}

export async function createMatch(params: CreateMatchParams): Promise<string> {
  const { client, address } = await getChainClient();
  const contractAddress = getContractAddress();

  const msg = {
    create_match: {
      match_id: params.matchId,
      player_a: params.playerA,
      player_b: params.playerB,
      stake: params.stake,
      denom: params.denom,
    },
  };

  const result = await client.execute(address, contractAddress, msg, "auto");

  console.log(`[Chain] CreateMatch tx: ${result.transactionHash}`);
  return result.transactionHash;
}
