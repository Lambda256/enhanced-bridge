import { task } from "hardhat/config";

task("change-owner-to-tlm", "Change owner to TimeLockedMultiSig")
  .addParam("enhancedMainBridge", "EnhancedMainBridge address")
  .addParam("proxy", "Proxy address")
  .addParam("timeLockedMultiSig", "TimeLockedMultiSig address")
  .setAction(async (taskArgs, hre) => {
    const enhancedMainBridge = await hre.ethers.getContractAt(
      "EnhancedMainBridge",
      taskArgs.enhancedMainBridge,
    );

    const tx = await enhancedMainBridge
      .attach(taskArgs.proxy)
      .transferOwnership(taskArgs.timeLockedMultiSig);

    await tx.wait();

    console.log(
      `Owner changed to ${taskArgs.timeLockedMultiSig} by tx hash ${tx.hash}`,
    );
  });
