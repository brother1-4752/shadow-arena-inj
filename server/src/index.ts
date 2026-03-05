import * as dotenv from "dotenv";
dotenv.config();

import { GameServer } from "./ws/server";

const PORT = parseInt(process.env.PORT || "8080");

new GameServer(PORT);

console.log(`[Server] Shadow Arena Game Server started`);
console.log(`[Server] Port: ${PORT}`);
console.log(
  `[Server] Contract: ${process.env.CONTRACT_ADDRESS || "(not set)"}`,
);
console.log(
  `[Server] Chain: ${process.env.INJECTIVE_CHAIN_ID || "injective-888"}`,
);
