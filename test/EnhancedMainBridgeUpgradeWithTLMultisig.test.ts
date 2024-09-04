import {
  EnhancedERC1967Proxy,
  EnhancedMainBridge,
  EnhancedMainBridgeV2,
  TimeLockedMultiSig,
} from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { timeLockedMultiSigTransactionProcess } from "./test.helper";

describe("EnhancedMainBridgeUpgradeWithTLMultisig", () => {
  let timeLockedMultiSig: TimeLockedMultiSig;
  let proxy: EnhancedERC1967Proxy;
  let enhancedMainBridge: EnhancedMainBridge;
  let enhancedMainBridgeV2: EnhancedMainBridgeV2;

  let proposers: SignerWithAddress[];
  let approvers: SignerWithAddress[];
  let executors: SignerWithAddress[];
  let validator1: SignerWithAddress;
  let validator2: SignerWithAddress;

  const chainId = 31337;
  const implementationSlot =
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

  before(async () => {
    const signers = await ethers.getSigners();
    proposers = signers.slice(0, 2);
    approvers = signers.slice(2, 6);
    executors = signers.slice(6, 8);
    validator1 = signers[8];
    validator2 = signers[9];
  });
  describe("deploy contract", () => {
    it("should deploy EnhancedMainBridge", async () => {
      const EnhancedMainBridge =
        await ethers.getContractFactory("EnhancedMainBridge");
      enhancedMainBridge = await EnhancedMainBridge.deploy();
      await enhancedMainBridge.deployed();

      expect(enhancedMainBridge.address).to.be.properAddress;
    });

    it("should deploy proxy", async () => {
      const Enhanced1967Proxy = await ethers.getContractFactory(
        "EnhancedERC1967Proxy",
      );

      const data = enhancedMainBridge.interface.encodeFunctionData(
        "initialize",
        [
          31337,
          ethers.Wallet.createRandom().address,
          ethers.Wallet.createRandom().address,
        ],
      );

      proxy = await Enhanced1967Proxy.deploy(enhancedMainBridge.address, data);
      await proxy.deployed();

      const tx = await enhancedMainBridge
        .attach(proxy.address)
        .registerSideBridge(ethers.Wallet.createRandom().address, 2, [
          validator1.address,
          validator2.address,
        ]);
      await tx.wait();

      const storageValue = await ethers.provider.getStorageAt(
        proxy.address,
        implementationSlot,
      );
      const implAddress = ethers.utils.getAddress(
        "0x" + storageValue.slice(-40),
      );

      expect(implAddress.toLowerCase()).to.equal(
        enhancedMainBridge.address.toLowerCase(),
      );
      expect(proxy.address).to.be.properAddress;
    });
  });
  describe("change owner to TimeLockedMultiSig", () => {
    before(async () => {
      const TimeLockedMultiSig =
        await ethers.getContractFactory("TimeLockedMultiSig");
      timeLockedMultiSig = await TimeLockedMultiSig.deploy(
        approvers.map((a) => a.address),
        3,
        1,
        proposers.map((p) => p.address),
        executors.map((e) => e.address),
        ethers.constants.AddressZero,
      );
      await timeLockedMultiSig.deployed();
    });

    it("checks owner after transfer ownership to TimeLockedMultiSig", async () => {
      const tx = await enhancedMainBridge
        .attach(proxy.address)
        .transferOwnership(timeLockedMultiSig.address);
      await tx.wait();

      const newOwner = await enhancedMainBridge.attach(proxy.address).owner();
      expect(newOwner).to.equal(timeLockedMultiSig.address);
    });
  });
  describe("upgrade to EnhancedMainBridgeV2", () => {
    const predecessor = ethers.constants.HashZero;
    const salt = ethers.utils.randomBytes(32);
    const delay = 1;

    before(async () => {
      const EnhancedMainBridgeV2 = await ethers.getContractFactory(
        "EnhancedMainBridgeV2",
      );
      enhancedMainBridgeV2 = await EnhancedMainBridgeV2.deploy();
      await enhancedMainBridgeV2.deployed();
    });
    it("should upgrade to EnhancedMainBridgeV2 by TimeLockedMultiSig", async () => {
      const initializeV2Data =
        enhancedMainBridgeV2.interface.encodeFunctionData("initializeV2", [
          [validator1.address, validator2.address],
        ]);

      const upgradeToAndCallData =
        enhancedMainBridge.interface.encodeFunctionData("upgradeToAndCall", [
          enhancedMainBridgeV2.address,
          initializeV2Data,
        ]);

      await timeLockedMultiSigTransactionProcess(
        timeLockedMultiSig,
        proposers[0],
        approvers,
        executors[0],
        3,
        proxy.address,
        0,
        upgradeToAndCallData,
        predecessor,
        salt,
        delay,
      );

      const chainIdV2 = await enhancedMainBridgeV2
        .attach(proxy.address)
        .chainId();

      const storageValue = await ethers.provider.getStorageAt(
        proxy.address,
        implementationSlot,
      );
      const implAddress = ethers.utils.getAddress(
        "0x" + storageValue.slice(-40),
      );

      expect(implAddress.toLowerCase()).to.equal(
        enhancedMainBridgeV2.address.toLowerCase(),
      );
      expect(chainIdV2).to.equal(chainId);
    });
  });
});
