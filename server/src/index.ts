import * as dotenv from "dotenv";
dotenv.config();

import { GameServer } from "./ws/server";
import { ensureServerAuthority } from "./chain/index";

const PORT = parseInt(process.env.PORT || "8080");

new GameServer(PORT);

console.log(`[Server] Shadow Arena Game Server started`);
console.log(`[Server] Port: ${PORT}`);
console.log(
  `[Server] Contract: ${JSON.stringify(process.env.CONTRACT_ADDRESS)} (len=${process.env.CONTRACT_ADDRESS?.length})`,
);
console.log(
  `[Server] Chain: ${process.env.INJECTIVE_CHAIN_ID || "injective-888"}`,
);

// Verify / update server_authority on-chain (async, non-blocking)
ensureServerAuthority().catch((err) => {
  console.error(`[Server] ensureServerAuthority error: ${err.message}`);
});
