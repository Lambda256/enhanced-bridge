import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { TimeLockedMultiSig } from "../typechain-types";
import { expect } from "chai";

describe("TimeLockedMultiSig", () => {
  let deployer: SignerWithAddress;
  let proposers: SignerWithAddress[];
  let approvers: SignerWithAddress[];
  let executors: SignerWithAddress[];
  let remainSigners: SignerWithAddress[];
  let timeLockedMultiSig: TimeLockedMultiSig;
  let threshold = 3;
  let minDelay = 1;

  before(async () => {
    const signers = await ethers.getSigners();
    deployer = signers[0];
    proposers = signers.slice(1, 3);
    approvers = signers.slice(3, 7);
    executors = signers.slice(7, 8);
    remainSigners = signers.slice(8, 10);
  });

  describe("Deploy TimeLockedMultiSig Contract", () => {
    it("should be deployed properly", async () => {
      const TimeLockedMultiSig =
        await ethers.getContractFactory("TimeLockedMultiSig");
      timeLockedMultiSig = await TimeLockedMultiSig.deploy(
        approvers.map((approver) => approver.address),
        threshold,
        minDelay,
        proposers.map((proposer) => proposer.address),
        executors.map((executor) => executor.address),
        ethers.constants.AddressZero,
      );
      await timeLockedMultiSig.deployed();

      expect(timeLockedMultiSig.address).to.properAddress;
    });
  });

  describe("Add Approver", () => {
    let salt: Uint8Array;
    let target: string;
    let value: number;
    let data: string;
    let predecessor: string;
    let delay: number;
    before(() => {
      salt = ethers.utils.randomBytes(32);
      target = timeLockedMultiSig.address;
      value = 0;
      data = timeLockedMultiSig.interface.encodeFunctionData("addApprover", [
        remainSigners[0].address,
        3,
      ]);
      predecessor = ethers.constants.HashZero;
      delay = 1;
    });

    it("is possible to schedule transaction only by proposer", async () => {
      const txResponse = await timeLockedMultiSig
        .connect(proposers[0])
        .schedule(target, value, data, predecessor, salt, delay);
      await txResponse.wait();

      await expect(txResponse).to.emit(timeLockedMultiSig, "CallScheduled");
    });

    it("is possible to approve transaction only by approver", async () => {
      for (let i = 0; i < threshold; i++) {
        await timeLockedMultiSig
          .connect(approvers[i])
          .approve(target, value, data, predecessor, salt);
      }

      const id = await timeLockedMultiSig.hashOperation(
        target,
        value,
        data,
        predecessor,
        salt,
      );

      const operation = await timeLockedMultiSig.getOperation(id);
      expect(operation.approvalCount).to.equal(threshold);
    });

    it("is possible to execute transaction only by executor", async () => {
      const txResponse = await timeLockedMultiSig
        .connect(executors[0])
        .execute(target, value, data, predecessor, salt);
      await txResponse.wait();

      const approvers = await timeLockedMultiSig.getApprovers();

      await expect(txResponse).to.emit(timeLockedMultiSig, "CallExecuted");
      expect(approvers).contains(remainSigners[0].address);
      expect(approvers.length).to.equal(5);
    });
  });

  describe("Update Approver", () => {
    let salt: Uint8Array;
    let target: string;
    let value: number;
    let data: string;
    let predecessor: string;
    let delay: number;
    before(() => {
      salt = ethers.utils.randomBytes(32);
      target = timeLockedMultiSig.address;
      value = 0;
      data = timeLockedMultiSig.interface.encodeFunctionData("updateApprover", [
        remainSigners[0].address,
        remainSigners[1].address,
        3,
      ]);
      predecessor = ethers.constants.HashZero;
      delay = 1;
    });

    it("should update approvers", async () => {
      const scheduleTx = await timeLockedMultiSig
        .connect(proposers[0])
        .schedule(target, value, data, predecessor, salt, delay);
      await scheduleTx.wait();

      for (let i = 0; i < threshold; i++) {
        const tx = await timeLockedMultiSig
          .connect(approvers[i])
          .approve(target, value, data, predecessor, salt);
        await tx.wait();
      }

      const executeTx = await timeLockedMultiSig
        .connect(executors[0])
        .execute(target, value, data, predecessor, salt);
      await executeTx.wait();

      const updatedApprovers = await timeLockedMultiSig.getApprovers();
      expect(updatedApprovers).contains(remainSigners[1].address);
      expect(updatedApprovers).not.contains(remainSigners[0].address);
    });
  });

  describe("Remove Approver", () => {
    let salt: Uint8Array;
    let target: string;
    let value: number;
    let data: string;
    let predecessor: string;
    let delay: number;
    before(() => {
      salt = ethers.utils.randomBytes(32);
      target = timeLockedMultiSig.address;
      value = 0;
      data = timeLockedMultiSig.interface.encodeFunctionData("removeApprover", [
        remainSigners[1].address,
        3,
      ]);
      predecessor = ethers.constants.HashZero;
      delay = 1;
    });

    it("should remove approvers", async () => {
      const scheduleTx = await timeLockedMultiSig
        .connect(proposers[0])
        .schedule(target, value, data, predecessor, salt, delay);
      await scheduleTx.wait();

      for (let i = 0; i < threshold; i++) {
        const tx = await timeLockedMultiSig
          .connect(approvers[i])
          .approve(target, value, data, predecessor, salt);
        await tx.wait();
      }

      const executeTx = await timeLockedMultiSig
        .connect(executors[0])
        .execute(target, value, data, predecessor, salt);
      await executeTx.wait();

      const updatedApprovers = await timeLockedMultiSig.getApprovers();
      expect(updatedApprovers).not.contains(remainSigners[1].address);
      expect(updatedApprovers.length).to.equal(4);
    });
  });
});
