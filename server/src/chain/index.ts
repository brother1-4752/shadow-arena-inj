import {
  PrivateKey,
  MsgBroadcasterWithPk,
  MsgExecuteContract,
  ChainRestAuthApi,
  toBase64,
  ChainGrpcWasmApi,
} from "@injectivelabs/sdk-ts";
import { Network, getNetworkEndpoints } from "@injectivelabs/networks";

let _broadcaster: MsgBroadcasterWithPk | null = null;
let _address: string | null = null;

export function getChainBroadcaster(): {
  broadcaster: MsgBroadcasterWithPk;
  address: string;
} {
  if (_broadcaster && _address) {
    return { broadcaster: _broadcaster, address: _address };
  }

  const mnemonic = process.env.SERVER_AUTHORITY_MNEMONIC;
  if (!mnemonic) {
    throw new Error("SERVER_AUTHORITY_MNEMONIC is not set");
  }

  const privateKey = PrivateKey.fromMnemonic(mnemonic);
  _address = privateKey.toBech32();

  const network = Network.TestnetSentry;
  const endpoints = getNetworkEndpoints(network);

  _broadcaster = new MsgBroadcasterWithPk({
    privateKey,
    network,
    endpoints,
    simulateTx: false,
  });

  console.log(`[Chain] Initialized with address ${_address}`);
  return { broadcaster: _broadcaster, address: _address };
}

export function getContractAddress(): string {
  const addr = process.env.CONTRACT_ADDRESS;
  if (!addr) throw new Error("CONTRACT_ADDRESS is not set");
  return addr;
}

/**
 * On startup, verify that the contract's server_authority matches
 * this server's address. If not, update it (requires owner role).
 */
export async function ensureServerAuthority(): Promise<void> {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress || !process.env.SERVER_AUTHORITY_MNEMONIC) {
    console.log("[Chain] Skipping server_authority check (not configured)");
    return;
  }

  const { broadcaster, address } = getChainBroadcaster();

  try {
    const network = Network.TestnetSentry;
    const endpoints = getNetworkEndpoints(network);
    const wasmApi = new ChainGrpcWasmApi(endpoints.grpc);

    const queryData = Buffer.from(JSON.stringify({ get_config: {} })).toString("base64");
    const response = await wasmApi.fetchSmartContractState(contractAddress, queryData);

    // response.data is a Uint8Array of the JSON
    const configStr = new TextDecoder().decode(response.data);
    const config = JSON.parse(configStr);

    if (config.server_authority === address) {
      console.log(`[Chain] server_authority already set to ${address}`);
      return;
    }

    console.log(
      `[Chain] server_authority mismatch: on-chain=${config.server_authority}, server=${address}. Updating...`,
    );

    const msg = MsgExecuteContract.fromJSON({
      sender: address,
      contractAddress,
      msg: {
        update_config: {
          server_authority: address,
        },
      },
    });

    const result = await broadcaster.broadcast({ msgs: msg });
    console.log(
      `[Chain] server_authority updated to ${address} (tx: ${result.txHash})`,
    );
  } catch (err: any) {
    console.error(
      `[Chain] Failed to check/update server_authority: ${err.message}`,
    );
    console.error(
      "[Chain] If this server address is not the contract owner, update server_authority manually.",
    );
  }
}
