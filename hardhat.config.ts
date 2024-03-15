import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "./scripts/deploy";
import "./scripts/upgrade";
import "./scripts/deploy-transfer-all";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.7",
  },
  networks: {
    hardhat: {},
  },
};

export default config;
