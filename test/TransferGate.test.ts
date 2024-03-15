import { ethers } from "hardhat";
import { expect } from "chai";
import { TestToken, TransferGate } from "../typechain-types";

describe("TransferGate", () => {
  let transferGate: TransferGate;
  let testToken: TestToken;

  const mainBridgeProxyAddress = "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82";
  const mintingBalance = 1000;
  before(async () => {
    const TestToken = await ethers.getContractFactory("TestToken");
    testToken = await TestToken.deploy("TestToken", "TestToken", 18, 0, 1000000000);
    await testToken.deployed();

    const TransferGate = await ethers.getContractFactory("TransferGate");
    transferGate = await TransferGate.deploy(
      testToken.address,
      mainBridgeProxyAddress,
    );
    await transferGate.deployed();
  });

  before(async () => {
    const tx = await testToken.mint(transferGate.address, mintingBalance);
    await tx.wait();
  });

  it("check balance of transferGate and transfer the balance to mainBridgeProxyAddress", async () => {
    const tx = await transferGate.transferGate();
    await tx.wait();

    const balance = await testToken.balanceOf(mainBridgeProxyAddress);
    const transferGateBalance = await testToken.balanceOf(transferGate.address);

    expect(balance.toNumber()).to.equal(mintingBalance);
    expect(transferGateBalance.toNumber()).to.equal(0);
  });
});
