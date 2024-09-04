import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-storage-layout";
import "./scripts/deploy";
import "./scripts/upgrade";
import "./scripts/deploy-transfer-all";
import "./scripts/upgrade-by-tlm";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.7",
    settings: {
      optimizer: {
        enabled: true,
        runs: 999,
      },
    },
  },
  networks: {
    hardhat: {},
  },
};

export default config;
