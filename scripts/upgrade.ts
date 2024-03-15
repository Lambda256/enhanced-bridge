import { task } from "hardhat/config";
import { EnhancedMainBridge__factory } from "../typechain-types";

task("upgrade", "Upgrade EnhancedMainBridge with EnhancedERC1967Proxy")
  .addParam("proxy", "Proxy contract address")
  .addParam("logicAddress", "New logic contract to be deployed address")
  .addParam(
    "initializeData",
    "New logic contract to be deployed initialize data",
  )
  .setAction(async (taskArgs, hre) => {
    const proxy = await hre.ethers.getContractAt(
      "EnhancedERC1967Proxy",
      taskArgs.proxy,
    );

    const enhancedMainBridgeInterface = EnhancedMainBridge__factory.createInterface();
    const upgradeAndCallData = enhancedMainBridgeInterface.encodeFunctionData(
      "upgradeToAndCall",
      [taskArgs.logicAddress, taskArgs.initializeData],
    );

    const txResponse = await proxy.fallback({
      data: upgradeAndCallData,
    });

    await txResponse.wait();
  });
