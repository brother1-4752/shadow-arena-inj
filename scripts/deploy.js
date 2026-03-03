const hre = require("hardhat");

async function main() {
  const Escrow = await hre.ethers.getContractFactory("ShadowArenaEscrow");
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();

  console.log("ShadowArenaEscrow deployed to:", await escrow.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
