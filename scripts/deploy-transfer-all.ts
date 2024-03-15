import { task } from "hardhat/config";

task("deploy-transfer-all", "Deploy TransferAll")
  .addParam("erc20", "erc20 address")
  .addParam("proxy", "proxy address")
  .setAction(async (taskArgs, hre) => {
    const TransferAll = await hre.ethers.getContractFactory("TransferAll");
    const transferAll = await TransferAll.deploy(
      taskArgs.erc20, // enhanced dev address 0x99B58C776bA77dC8a8d539F7d0FFE5fA4f01A999
      taskArgs.proxy, // dev proxy 0x0613fFfc0c37a29F42E4D7c40Ec22F5E91070b9A
    );

    await transferAll.deployed();

    console.log("TransferAll deployed to:", transferAll.address);
  });
