import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import {
  EnhancedERC1967Proxy,
  EnhancedMainBridge,
  EnhancedMainBridgeV2,
} from "../typechain-types";
import { EnhancedProxyEventMatcher } from "./test.helper";
import { expect } from "chai";

describe("EnhancedMainBridgeV2", () => {
  let proxy: EnhancedERC1967Proxy;
  let enhancedMainBridge: EnhancedMainBridge;
  let enhancedMainBridgeV2: EnhancedMainBridgeV2;
  let contractOwner: SignerWithAddress;
  let authority1: SignerWithAddress;
  let authority2: SignerWithAddress;
  let authority3: SignerWithAddress;
  const sideBridge = ethers.Wallet.createRandom().address;

  // upgrade contract
  before(async () => {
    const signers = await ethers.getSigners();
    contractOwner = signers[0];
    authority1 = signers[1];
    authority2 = signers[2];
    authority3 = signers[3];

    const EnhancedMainBridge =
      await ethers.getContractFactory("EnhancedMainBridge");
    enhancedMainBridge = await EnhancedMainBridge.deploy();
    await enhancedMainBridge.deployed();

    const EnhancedERC1967Proxy = await ethers.getContractFactory(
      "EnhancedERC1967Proxy",
    );
    const data = enhancedMainBridge.interface.encodeFunctionData("initialize", [
      31337,
      ethers.Wallet.createRandom().address,
      ethers.Wallet.createRandom().address,
    ]);

    proxy = await EnhancedERC1967Proxy.deploy(enhancedMainBridge.address, data);
    await proxy.deployed();

    const registerSideBridge = enhancedMainBridge.interface.encodeFunctionData(
      "registerSideBridge",
      [sideBridge, 2, [authority1.address, authority2.address]],
    );

    const txResponse = await proxy.fallback({
      data: registerSideBridge,
    });
    await txResponse.wait();

    const EnhancedMainBridgeV2 = await ethers.getContractFactory(
      "EnhancedMainBridgeV2",
    );
    enhancedMainBridgeV2 = await EnhancedMainBridgeV2.deploy();
    await enhancedMainBridgeV2.deployed();

    const initializeV2Data = enhancedMainBridgeV2.interface.encodeFunctionData(
      "initializeV2",
      [[authority1.address, authority2.address]],
    );
    const upgradeAndCallData = enhancedMainBridge.interface.encodeFunctionData(
      "upgradeToAndCall",
      [enhancedMainBridgeV2.address, initializeV2Data],
    );
    const upgradeTxResponse = await proxy.fallback({
      data: upgradeAndCallData,
    });
    await upgradeTxResponse.wait();
  });

  describe("approve withdraw when authority changed", () => {
    const sideChanId = 1;
    const sideChainName = "sideChainName";
    const sideChainSymbol = "SCN";
    const conversionRate = 1;
    const conversionRateDecimals = 1;
    let sideTokenId: string;

    // withdraw
    const beneficiary = ethers.Wallet.createRandom().address;
    const amountSt = 1;
    const txHash = ethers.utils.formatBytes32String("");
    let redeemId: string;

    before(async () => {
      // register side token
      const sideTokenIdPacked = ethers.utils.solidityPack(
        [
          "address",
          "address",
          "string",
          "string",
          "uint256",
          "uint8",
          "uint256",
        ],
        [
          proxy.address,
          sideBridge,
          sideChainName,
          sideChainSymbol,
          conversionRate,
          conversionRateDecimals,
          sideChanId,
        ],
      );
      sideTokenId = ethers.utils.keccak256(sideTokenIdPacked);
      const registerSideTokenData =
        enhancedMainBridgeV2.interface.encodeFunctionData("registerSideToken", [
          sideChanId,
          sideChainName,
          sideChainSymbol,
          conversionRate,
          conversionRateDecimals,
          sideTokenId,
        ]);

      const txResponse = await proxy.fallback({
        data: registerSideTokenData,
      });

      await txResponse.wait();

      const redeemIdPacked = ethers.utils.solidityPack(
        ["bytes32", "address", "uint256", "bytes32"],
        [sideTokenId, beneficiary, amountSt, txHash],
      );
      redeemId = ethers.utils.keccak256(redeemIdPacked);
    });

    it("initiate withdraw", async () => {
      const initiateWithdrawData =
        enhancedMainBridgeV2.interface.encodeFunctionData("withdraw", [
          redeemId,
          sideTokenId,
          beneficiary,
          amountSt,
          txHash,
        ]);

      const tx = await proxy.connect(authority1).fallback({
        data: initiateWithdrawData,
      });

      const receipt = await tx.wait();
      EnhancedProxyEventMatcher.emit(receipt, "MainTokenWithdrawSigned");
    });

    it("change authority request", async () => {
      const changeAuthorityRequest =
        enhancedMainBridgeV2.interface.encodeFunctionData(
          "changeAuthorityRequest",
          [authority1.address, authority3.address],
        );

      const tx = await proxy.fallback({
        data: changeAuthorityRequest,
      });

      const receipt = await tx.wait();
      EnhancedProxyEventMatcher.emit(receipt, "ChangeAuthorityRequest");
    });

    it("change authority", async () => {
      const changeIdPacked = ethers.utils.solidityPack(
        ["address", "address", "uint256"],
        [authority1.address, authority3.address, 0],
      );
      const changeId = ethers.utils.keccak256(changeIdPacked);

      const changeAuthorityData =
        enhancedMainBridgeV2.interface.encodeFunctionData("changeAuthority", [
          changeId,
          authority1.address,
          authority3.address,
        ]);

      const tx1 = await proxy.connect(authority1).fallback({
        data: changeAuthorityData,
      });

      await tx1.wait();

      const tx2 = await proxy.connect(authority2).fallback({
        data: changeAuthorityData,
      });

      const receipt = await tx2.wait();

      EnhancedProxyEventMatcher.emit(receipt, "AuthorityChanged");
    });

    it("check authority list", async () => {
      const authorityListData =
        enhancedMainBridgeV2.interface.encodeFunctionData("getAuthorities");

      const authorities = await ethers.provider.call({
        to: proxy.address,
        data: authorityListData,
      });

      // encode authorities and compare result
      const expectedAuthorities = ethers.utils.defaultAbiCoder.encode(
        ["address[]"],
        [[authority3.address, authority2.address]],
      );
      expect(authorities).to.equal(expectedAuthorities);
    });

    it("should fail when authority3 try to approve withdraw", async () => {
      const initiateWithdrawData =
        enhancedMainBridgeV2.interface.encodeFunctionData("withdraw", [
          redeemId,
          sideTokenId,
          beneficiary,
          amountSt,
          txHash,
        ]);

      try {
        const tx = await proxy.connect(authority3).fallback({
          data: initiateWithdrawData,
        });
        await tx.wait();
      } catch (error: any) {
        expect(error.message).to.contain("not possible authority");
      }
    });

    it("should success when authority2 try to approve withdraw", async () => {
      const initiateWithdrawData =
        enhancedMainBridgeV2.interface.encodeFunctionData("withdraw", [
          redeemId,
          sideTokenId,
          beneficiary,
          amountSt,
          txHash,
        ]);

      const tx = await proxy.connect(authority2).fallback({
        data: initiateWithdrawData,
      });
      await tx.wait();
      // mainToken() is not implemented in EnhancedMainBridgeV2!!
    });
  });
});
