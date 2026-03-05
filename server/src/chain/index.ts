import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";

let _client: SigningCosmWasmClient | null = null;
let _address: string | null = null;

export async function getChainClient(): Promise<{
  client: SigningCosmWasmClient;
  address: string;
}> {
  if (_client && _address) {
    return { client: _client, address: _address };
  }

  const mnemonic = process.env.SERVER_AUTHORITY_MNEMONIC;
  const rpc =
    process.env.INJECTIVE_RPC ||
    "https://testnet.sentry.tm.injective.network:443";

  if (!mnemonic) {
    throw new Error("SERVER_AUTHORITY_MNEMONIC is not set");
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: "inj",
  });

  const [account] = await wallet.getAccounts();
  _address = account.address;

  _client = await SigningCosmWasmClient.connectWithSigner(rpc, wallet, {
    gasPrice: GasPrice.fromString("500000000inj"),
  });

  console.log(`[Chain] Connected as ${_address}`);
  return { client: _client, address: _address };
}

export function getContractAddress(): string {
  const addr = process.env.CONTRACT_ADDRESS;
  if (!addr) throw new Error("CONTRACT_ADDRESS is not set");
  return addr;
}
