import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  Log,
  TransactionReceipt,
  TransactionResponse,
} from "@ethersproject/abstract-provider";
import { expect } from "chai";
import { TransactionRequest } from "@ethersproject/providers";
import { EnhancedMainBridge__factory } from "../typechain-types";
import { EnhancedMainBridgeInterface } from "../typechain-types/contracts/EnhancedMainBridge";

export async function deployEnhancedMainBridge(
  mainChainId: number,
  mainAdmin: SignerWithAddress,
) {
  const ERC20Token = await ethers.getContractFactory("ERC20Token");
  const erc20Token = await ERC20Token.deploy(
    "Test Token",
    "TTK",
    18,
    1000000,
    1000000,
  );
  await erc20Token.deployed();

  const EnhancedMainBridge =
    await ethers.getContractFactory("EnhancedMainBridge");
  const enhancedMainBridge = await EnhancedMainBridge.deploy();
  await enhancedMainBridge.deployed();

  const Proxy = await ethers.getContractFactory("EnhancedERC1967Proxy");
  const data = enhancedMainBridge.interface.encodeFunctionData("initialize", [
    mainChainId,
    erc20Token.address,
    mainAdmin.address,
  ]);
  const proxy = await Proxy.deploy(enhancedMainBridge.address, data);
  await proxy.deployed();

  return proxy;
}

export async function deploySideBridge(
  deployer: SignerWithAddress,
  mainChainId: number,
  proxyAddress: string,
  sideChainId: number,
  authorities: string[],
) {
  const SideBridge = await ethers.getContractFactory("SideBridge");
  const sideBridge = await SideBridge.connect(deployer).deploy(
    mainChainId,
    proxyAddress,
    sideChainId,
    2,
    authorities,
  );
  await sideBridge.deployed();
  return sideBridge;
}

export function createRegisterSideBridgeData(
  mainBridgeInterface: EnhancedMainBridgeInterface,
  sideBridgeAddress: string,
  requiredSignatures: number,
  authorities: string[],
) {
  return mainBridgeInterface.encodeFunctionData("registerSideBridge", [
    sideBridgeAddress,
    requiredSignatures,
    authorities,
  ]);
}

export function createRegisterSideTokenData(
  mainBridgeInterface: EnhancedMainBridgeInterface,
  sideChainId: number,
  sideTokenName: string,
  sideTokenSymbol: string,
  conversionRate: number,
  conversionRateDecimals: number,
  sideTokenId: string,
) {
  return mainBridgeInterface.encodeFunctionData("registerSideToken", [
    sideChainId,
    sideTokenName,
    sideTokenSymbol,
    conversionRate,
    conversionRateDecimals,
    sideTokenId,
  ]);
}

export async function waitProxyTransactionResponse(
  txFun: (tx: TransactionRequest) => Promise<TransactionResponse>,
  transactionRequest: TransactionRequest,
) {
  const txResponse = await txFun(transactionRequest);
  return txResponse.wait();
}

export class EnhancedProxyEventMatcher {
  static storage: Record<string, Log[]> = {};
  static currEvent: string;

  static getEventHash(event: string) {
    switch (event) {
      case "SideBridgeRegistered": {
        return "0xf70030a5402bb43c9cb6a337a9ffcf95841eb0736648a85be0e51e9baed1d991";
      }
      case "SideTokenRegistered": {
        return "0x883a16573d45ec87a5b645267c0c81f9ecd233c8f613ac3bc59939d393dc26d2";
      }
      case "Deposited": {
        return "0xf28ee2c7592ae1744b742a5911664005bf0f80dbfbeeead8e076eeec385b1d27";
      }
      case "Unstaked": {
        return "0x0f5bb82176feb1b5e747e28471aa92156a04d9f3ab9f45f28e2d704232b93f75";
      }
      case "MainTokenWithdrawSigned": {
        return "0x5b34e54d955185b4e39d529b203ed8338de517296675b59cc70b0708ce47928f";
      }
      default: {
        throw new Error(`Event ${event} not found`);
      }
    }
  }
  static async getInterface(): Promise<EnhancedMainBridgeInterface> {
    return EnhancedMainBridge__factory.createInterface();
  }
  static emit(receipt: TransactionReceipt, event: string) {
    const logs: Log[] = receipt.logs.filter((log) => {
      return log.topics[0] === this.getEventHash(event);
    });

    expect(logs.length).to.be.greaterThan(0);

    this.storage[event] = logs;
    this.currEvent = event;

    return this;
  }

  static async withArgs(...args: any[]) {
    const logs = this.storage[this.currEvent];
    const iface = await this.getInterface();

    this.storage[this.currEvent] = logs.filter((log) => {
      let result = iface.decodeEventLog(this.currEvent, log.data, log.topics);
      try {
        expect(result).to.deep.equal(args);
        return false;
      } catch (e) {
        console.error(e);
      }
      return true;
    });
    if (logs.length === this.storage[this.currEvent].length) {
      throw new Error("No matching logs found");
    }

    return this;
  }
}
