/**
 * Deploy (store + instantiate) the shadow_arena CosmWasm contract
 * to Injective testnet using @injectivelabs/sdk-ts.
 *
 * Usage:  npx tsx scripts/deploy.ts
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import {
  PrivateKey,
  MsgBroadcasterWithPk,
  MsgStoreCode,
  MsgInstantiateContract,
  toBase64,
} from "@injectivelabs/sdk-ts";
import { Network, getNetworkEndpoints } from "@injectivelabs/networks";

const WASM_PATH = path.resolve(__dirname, "../../artifacts/shadow_arena.wasm");

async function main() {
  const mnemonic = process.env.SERVER_AUTHORITY_MNEMONIC;
  if (!mnemonic) throw new Error("SERVER_AUTHORITY_MNEMONIC not set in .env");

  const privateKey = PrivateKey.fromMnemonic(mnemonic);
  const address = privateKey.toBech32();
  console.log(`Deployer address: ${address}`);

  const network = Network.TestnetSentry;
  const endpoints = getNetworkEndpoints(network);

  const broadcaster = new MsgBroadcasterWithPk({
    privateKey,
    network,
    endpoints,
    simulateTx: true,
  });

  // ---- Step 1: Store code ----
  console.log("\n=== Step 1: Store WASM code ===");
  const wasmBytes = fs.readFileSync(WASM_PATH);
  // gzip compress the wasm for smaller tx size
  const wasmGz = zlib.gzipSync(wasmBytes);
  console.log(
    `WASM size: ${wasmBytes.length} bytes (gzip: ${wasmGz.length} bytes)`,
  );

  const storeMsg = MsgStoreCode.fromJSON({
    sender: address,
    wasmBytes: wasmGz,
  });

  console.log("Broadcasting StoreCode tx...");
  const storeResult = await broadcaster.broadcast({ msgs: storeMsg });
  console.log(`StoreCode tx hash: ${storeResult.txHash}`);

  // Extract code_id from events
  let codeId: string | undefined;
  if (storeResult.rawLog) {
    const match = storeResult.rawLog.match(/"code_id","value":"(\d+)"/);
    if (match) codeId = match[1];
  }
  // Also check events array
  if (!codeId && (storeResult as any).events) {
    for (const evt of (storeResult as any).events) {
      if (evt.type === "store_code") {
        const attr = evt.attributes?.find((a: any) => a.key === "code_id");
        if (attr) {
          codeId = attr.value;
          break;
        }
      }
    }
  }
  // Fallback: parse raw log JSON
  if (!codeId && storeResult.rawLog) {
    try {
      const logs = JSON.parse(storeResult.rawLog);
      for (const log of logs) {
        for (const evt of log.events || []) {
          if (
            evt.type === "store_code" ||
            evt.type === "cosmwasm.wasm.v1.EventCodeStored"
          ) {
            const attr = evt.attributes?.find((a: any) => a.key === "code_id");
            if (attr) {
              codeId = attr.value;
              break;
            }
          }
        }
      }
    } catch {}
  }

  if (!codeId) {
    console.error("Could not extract code_id from tx result.");
    console.error("Raw log:", storeResult.rawLog);
    console.error("Full result:", JSON.stringify(storeResult, null, 2));
    process.exit(1);
  }

  console.log(`Code ID: ${codeId}`);

  // ---- Step 2: Instantiate ----
  console.log("\n=== Step 2: Instantiate contract ===");
  const instantiateMsg = {
    server_authority: address,
    dispute_resolver: address,
    fee_bps: 250, // 2.5%
    dispute_window_secs: 3600, // 1 hour
    resolve_deadline_secs: 86400, // 24 hours
  };
  console.log("Instantiate msg:", JSON.stringify(instantiateMsg, null, 2));

  const instMsg = MsgInstantiateContract.fromJSON({
    sender: address,
    admin: address,
    codeId: parseInt(codeId, 10),
    label: "shadow_arena_v2",
    msg: instantiateMsg,
  });

  console.log("Broadcasting InstantiateContract tx...");
  const instResult = await broadcaster.broadcast({ msgs: instMsg });
  console.log(`Instantiate tx hash: ${instResult.txHash}`);

  // Extract contract address
  let contractAddress: string | undefined;
  if (instResult.rawLog) {
    const match = instResult.rawLog.match(
      /"_contract_address","value":"(inj[a-z0-9]+)"/,
    );
    if (match) contractAddress = match[1];
  }
  if (!contractAddress && (instResult as any).events) {
    for (const evt of (instResult as any).events) {
      if (evt.type === "instantiate") {
        const attr = evt.attributes?.find(
          (a: any) => a.key === "_contract_address",
        );
        if (attr) {
          contractAddress = attr.value;
          break;
        }
      }
    }
  }
  if (!contractAddress && instResult.rawLog) {
    try {
      const logs = JSON.parse(instResult.rawLog);
      for (const log of logs) {
        for (const evt of log.events || []) {
          const attr = evt.attributes?.find(
            (a: any) => a.key === "_contract_address",
          );
          if (attr) {
            contractAddress = attr.value;
            break;
          }
        }
      }
    } catch {}
  }

  if (!contractAddress) {
    console.error("Could not extract contract address from tx result.");
    console.error("Raw log:", instResult.rawLog);
    console.error("Full result:", JSON.stringify(instResult, null, 2));
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(`  Contract Address: ${contractAddress}`);
  console.log(`  Code ID: ${codeId}`);
  console.log(`========================================`);
  console.log(`\nUpdate your .env files:`);
  console.log(`  server/.env          → CONTRACT_ADDRESS=${contractAddress}`);
  console.log(
    `  apps/game-web/.env   → VITE_CONTRACT_ADDRESS=${contractAddress}`,
  );
}

main().catch((err) => {
  console.error("Deploy failed:", err);
  process.exit(1);
});
