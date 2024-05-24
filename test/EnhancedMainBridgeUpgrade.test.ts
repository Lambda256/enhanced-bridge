import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  EnhancedERC1967Proxy,
  EnhancedMainBridge,
  EnhancedMainBridgeV2,
  MultiSig,
} from "../typechain-types";
import { ethers } from "hardhat";
import { expect } from "chai";
import { createTxId } from "./test.helper";

describe("EnhancedMainBridgeUpgrade", () => {
  let multiSig: MultiSig;
  let proxy: EnhancedERC1967Proxy;
  let enhancedMainBridge: EnhancedMainBridge;
  let enhancedMainBridgeV2: EnhancedMainBridgeV2;

  let validator1: SignerWithAddress;
  let validator2: SignerWithAddress;
  const mainTokenAddress = ethers.Wallet.createRandom().address;

  before(async () => {
    const signers = await ethers.getSigners();
    validator1 = signers[1];
    validator2 = signers[2];

    const EnhancedMainBridge =
      await ethers.getContractFactory("EnhancedMainBridge");
    enhancedMainBridge = await EnhancedMainBridge.deploy();
    await enhancedMainBridge.deployed();

    const EnhancedERC1967Proxy = await ethers.getContractFactory(
      "EnhancedERC1967Proxy",
    );

    const data = enhancedMainBridge.interface.encodeFunctionData("initialize", [
      31337,
      mainTokenAddress,
      ethers.Wallet.createRandom().address,
    ]);

    proxy = await EnhancedERC1967Proxy.deploy(enhancedMainBridge.address, data);
    await proxy.deployed();

    const tx = await enhancedMainBridge
      .attach(proxy.address)
      .registerSideBridge(ethers.Wallet.createRandom().address, 2, [
        validator1.address,
        validator2.address,
      ]);
    await tx.wait();
  });

  describe("change owner to MultiSigContract", () => {
    before(async () => {
      const MultiSig = await ethers.getContractFactory("MultiSig");
      multiSig = await MultiSig.deploy(
        [validator1.address, validator2.address],
        2,
      );
      await multiSig.deployed();
    });

    it("checks owner after transfer ownership to MultiSigContract", async () => {
      const tx = await enhancedMainBridge
        .attach(proxy.address)
        .transferOwnership(multiSig.address);
      await tx.wait();

      const newOwner = await enhancedMainBridge.attach(proxy.address).owner();
      expect(newOwner).to.equal(multiSig.address);
    });
  });

  describe("upgrade to EnhancedMainBridgeV2", () => {
    let initializeV2Data: string;
    before(async () => {
      const EnhancedMainBridgeV2 = await ethers.getContractFactory(
        "EnhancedMainBridgeV2",
      );
      enhancedMainBridgeV2 = await EnhancedMainBridgeV2.deploy();
      await enhancedMainBridgeV2.deployed();

      initializeV2Data = enhancedMainBridgeV2.interface.encodeFunctionData(
        "initializeV2",
        [[validator1.address, validator2.address]],
      );
    });
    it("is impossible to upgrade by not owner", async () => {
      await expect(
        enhancedMainBridge
          .attach(proxy.address)
          .upgradeToAndCall(enhancedMainBridgeV2.address, initializeV2Data),
      ).to.revertedWithCustomError(
        enhancedMainBridge,
        "OwnableUnauthorizedAccount",
      );
    });

    describe("upgrade by MultiSig (owner)", () => {
      let upgradeToAndCallData: string;

      before(async () => {
        upgradeToAndCallData = enhancedMainBridge.interface.encodeFunctionData(
          "upgradeToAndCall",
          [enhancedMainBridgeV2.address, initializeV2Data],
        );
      });
      it("submit upgrade transaction to MultiSig", async () => {
        const tx = await multiSig
          .connect(validator1)
          .submitTransaction(proxy.address, upgradeToAndCallData);
        await tx.wait();

        await expect(tx).to.emit(multiSig, "SubmitTransaction");
      });

      it("approve upgrade transaction by validator1", async () => {
        const txId = createTxId(proxy.address, upgradeToAndCallData, 1);
        const tx = await multiSig.connect(validator1).approveTransaction(txId);
        await tx.wait();

        await expect(tx).to.emit(multiSig, "ApproveTransaction");
      });

      it("approve upgrade transaction by validator2 and executed", async () => {
        const txId = createTxId(proxy.address, upgradeToAndCallData, 1);
        const tx = await multiSig.connect(validator2).approveTransaction(txId);
        await tx.wait();

        await expect(tx).to.emit(multiSig, "ExecuteTransaction");
        await expect(tx).to.emit(proxy, "Upgraded");
      });

      it("checks chanid and approved token in EnhancedMainBridgeV2", async () => {
        const chainId = await enhancedMainBridgeV2
          .attach(proxy.address)
          .chainId();
        const approvedToken = await enhancedMainBridgeV2
          .attach(proxy.address)
          .isApprovedToken(mainTokenAddress);
        expect(chainId).to.equal(31337);
        expect(approvedToken).to.equal(true);
      });
    });
  });
});
