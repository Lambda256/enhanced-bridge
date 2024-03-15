import {
  EnhancedERC1967Proxy,
  EnhancedMainBridge,
  TestEnhancedMainBridgeV2,
} from "../typechain-types";
import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("EnhancedMainBridgeUpgrade", () => {
  let proxy: EnhancedERC1967Proxy;
  let enhancedMainBridge: EnhancedMainBridge;
  let enhancedMainBridgeV2: TestEnhancedMainBridgeV2;
  let contractOwner: SignerWithAddress;

  before(async () => {
    const EnhancedMainBridge = await ethers.getContractFactory("EnhancedMainBridge");
    enhancedMainBridge = await EnhancedMainBridge.deploy();
    await enhancedMainBridge.deployed();

    const signers = await ethers.getSigners();
    contractOwner = signers[0];
  });

  it("초기화 조건이 맞지 않을 경우 프록시 배포에 실패한다", async () => {
    const EnhancedERC1967Proxy =
      await ethers.getContractFactory("EnhancedERC1967Proxy");
    const data = enhancedMainBridge.interface.encodeFunctionData("initialize", [
      0,
      ethers.Wallet.createRandom().address,
      ethers.Wallet.createRandom().address,
    ]);

    try {
      proxy = await EnhancedERC1967Proxy.deploy(enhancedMainBridge.address, data);
      await proxy.deployed();
    } catch (error: any) {
      expect(error.message).to.contain("transaction may fail");
    }
  });

  it("초기화 조건이 맞을 경우 프록시 배포에 성공한다", async () => {
    const EnhancedERC1967Proxy =
      await ethers.getContractFactory("EnhancedERC1967Proxy");
    const data = enhancedMainBridge.interface.encodeFunctionData("initialize", [
      31337,
      ethers.Wallet.createRandom().address,
      ethers.Wallet.createRandom().address,
    ]);

    proxy = await EnhancedERC1967Proxy.deploy(enhancedMainBridge.address, data);
    await proxy.deployed();

    // then
    const chainIdData = enhancedMainBridge.interface.encodeFunctionData("chainId");
    const ownerData = enhancedMainBridge.interface.encodeFunctionData("owner");
    const chainId = await ethers.provider.call({
      to: proxy.address,
      data: chainIdData,
    });
    const owner = await ethers.provider.call({
      to: proxy.address,
      data: ownerData,
    });

    expect(parseInt(chainId)).to.equal(31337);
    expect(ethers.utils.hexValue(owner)).to.equal(
      contractOwner.address.toLowerCase(),
    );
  });

  it("TestEnhancedMainBridgeV2로 업그레이드 한다, 기존의 초기화 정보를 확인한다", async () => {
    const EnhancedMainBridgeV2 = await ethers.getContractFactory(
      "TestEnhancedMainBridgeV2",
    );
    enhancedMainBridgeV2 = await EnhancedMainBridgeV2.deploy();
    await enhancedMainBridgeV2.deployed();

    const initializeV2Data =
      enhancedMainBridgeV2.interface.encodeFunctionData("initializeV2");

    const upgradeAndCallData = enhancedMainBridge.interface.encodeFunctionData(
      "upgradeToAndCall",
      [enhancedMainBridgeV2.address, initializeV2Data],
    );
    const txResponse = await proxy.fallback({
      data: upgradeAndCallData,
    });
    await txResponse.wait();

    // then
    const chainIdData =
      enhancedMainBridgeV2.interface.encodeFunctionData("chainId");
    const ownerData = enhancedMainBridgeV2.interface.encodeFunctionData("owner");

    const chainId = await ethers.provider.call({
      to: proxy.address,
      data: chainIdData,
    });
    const owner = await ethers.provider.call({
      to: proxy.address,
      data: ownerData,
    });

    expect(parseInt(chainId)).to.equal(31337);
    expect(ethers.utils.hexValue(owner)).to.equal(
      contractOwner.address.toLowerCase(),
    );
  });

  it("disableInitializer 를 호출하면 더 이상 업그레이드가 불가능하다", async () => {
    // call disableInitializer
    const disableInitializerData =
      enhancedMainBridgeV2.interface.encodeFunctionData("disableInitializers");

    const txResponse = await proxy.fallback({
      data: disableInitializerData,
    });

    await txResponse.wait();

    // upgrade
    const EnhancedMainBridgeV3 = await ethers.getContractFactory(
      "TestEnhancedMainBridgeV3",
    );
    const enhancedMainBridgeV3 = await EnhancedMainBridgeV3.deploy();
    await enhancedMainBridgeV3.deployed();

    const initializeV3Data =
      enhancedMainBridgeV3.interface.encodeFunctionData("initializeV3");

    const upgradeAndCallData = enhancedMainBridgeV2.interface.encodeFunctionData(
      "upgradeToAndCall",
      [enhancedMainBridgeV3.address, initializeV3Data],
    );

    // then
    await expect(
      proxy.fallback({
        data: upgradeAndCallData,
      }),
    ).to.revertedWithCustomError(enhancedMainBridgeV3, "InvalidInitialization");
  });
});
