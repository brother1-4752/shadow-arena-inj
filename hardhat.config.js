require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.24",
  networks: {
    injective: {
      url: "https://k8s.testnet.json-rpc.injective.network",
      chainId: 1776,
      accounts: [process.env.PRIVATE_KEY],
    },
  },
};
