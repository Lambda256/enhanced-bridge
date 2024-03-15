import { task } from "hardhat/config";
import { EnhancedMainBridge__factory } from "../typechain-types";
import { ethers } from "ethers";

function getInterfaceForNotHardhatProject() {
  return new ethers.utils.Interface(
    require("../artifacts/contracts/EnhancedMainBridge.sol/EnhancedMainBridge.json").abi,
  );
}

task("deploy-dev", "Deploy EnhancedMainBridge with EnhancedERC1967Proxy").setAction(
  async (_, hre) => {
    const ERC20Token = await hre.ethers.getContractFactory("ERC20Token");
    const erc20Token = await ERC20Token.deploy(
      "Test Token",
      "TTK",
      18,
      1000000,
      1000000,
    );
    await erc20Token.deployed();

    const EnhancedMainBridge =
      await hre.ethers.getContractFactory("EnhancedMainBridge");
    const enhancedMainBridge = await EnhancedMainBridge.deploy();
    await enhancedMainBridge.deployed();

    // const iface = getInterfaceForNotHardhatProject();
    const Proxy = await hre.ethers.getContractFactory("EnhancedERC1967Proxy");
    const data = enhancedMainBridge.interface.encodeFunctionData("initialize", [
      1000,
      erc20Token.address,
      "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
    ]);
    const proxy = await Proxy.deploy(enhancedMainBridge.address, data);
    await proxy.deployed();

    console.log("EnhancedERC1967 deployed to:", proxy.address);
  },
);

task("deploy-prod", "Deploy EnhancedMainBridge with EnhancedERC1967Proxy")
  .addParam("mainChainId", "Main chain ID")
  .addParam("token", "Token address")
  .addParam("mainAdmin", "Main admin address")
  .setAction(async (taskArgs, hre) => {
    const EnhancedMainBridge =
      await hre.ethers.getContractFactory("EnhancedMainBridge");
    const enhancedMainBridge = await EnhancedMainBridge.deploy();
    await enhancedMainBridge.deployed();

    const Proxy = await hre.ethers.getContractFactory("EnhancedERC1967Proxy");
    const initializeData = enhancedMainBridge.interface.encodeFunctionData(
      "initialize",
      [taskArgs.mainChainId, taskArgs.token, taskArgs.mainAdmin],
    );
    const proxy = await Proxy.deploy(enhancedMainBridge.address, initializeData);
    await proxy.deployed();

    console.log("EnhancedERC1967 deployed to:", proxy.address);
  });

task("deploy-check", "Check Proxy and MainBridge correctly deployed")
  .addParam("proxy", "Proxy Contract Address")
  .setAction(async (taskArgs, hre) => {
    const EnhancedMainBridgeInterface = EnhancedMainBridge__factory.createInterface();
    const mainChainIdData =
      EnhancedMainBridgeInterface.encodeFunctionData("chainId");

    const mainChainId = await hre.ethers.provider.call({
      to: taskArgs.proxy,
      data: mainChainIdData,
    });

    console.log("Main chain ID:", mainChainId);
  });
