import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { TestToken, TimeLockedMultiSig } from "../typechain-types";
import { expect } from "chai";
import { sleep, timeLockedMultiSigTransactionProcess } from "./test.helper";

describe("TimeLockedMultiSig", () => {
  let proposers: SignerWithAddress[];
  let approvers: SignerWithAddress[];
  let executors: SignerWithAddress[];
  let remainSigners: SignerWithAddress[];
  let tokenReceiver: SignerWithAddress;
  let timeLockedMultiSig: TimeLockedMultiSig;
  let testToken: TestToken;
  let threshold = 3;
  let minDelay = 1;

  before(async () => {
    const signers = await ethers.getSigners();
    proposers = signers.slice(1, 3);
    approvers = signers.slice(3, 7);
    executors = signers.slice(7, 8);
    remainSigners = signers.slice(8, 10);
    tokenReceiver = signers[0];

    const TestToken = await ethers.getContractFactory("TestToken");
    testToken = await TestToken.deploy("TestToken", "TT", 18, 0, 100);
    await testToken.deployed();
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
        const tx = await timeLockedMultiSig
          .connect(approvers[i])
          .approve(target, value, data, predecessor, salt);
        await tx.wait();
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
      await timeLockedMultiSigTransactionProcess(
        timeLockedMultiSig,
        proposers[0],
        approvers,
        executors[0],
        threshold,
        target,
        value,
        data,
        predecessor,
        salt,
        delay,
      );

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
      await timeLockedMultiSigTransactionProcess(
        timeLockedMultiSig,
        proposers[0],
        approvers,
        executors[0],
        threshold,
        target,
        value,
        data,
        predecessor,
        salt,
        delay,
      );

      const updatedApprovers = await timeLockedMultiSig.getApprovers();
      expect(updatedApprovers).not.contains(remainSigners[1].address);
      expect(updatedApprovers.length).to.equal(4);
    });
  });

  describe("Predecessor", () => {
    let predecessorTxParameter: {
      target: string;
      value: number;
      data: string;
      predecessor: string;
      salt: Uint8Array;
      delay: number;
    };
    let postTxParameter: {
      target: string;
      value: number;
      data: string;
      predecessor?: string;
      salt: Uint8Array;
      delay: number;
    };

    before(() => {
      const target = testToken.address;
      const value = 0;
      const data = testToken.interface.encodeFunctionData("mint", [
        tokenReceiver.address,
        30,
      ]);
      const delay = 1;

      predecessorTxParameter = {
        target,
        value,
        data,
        predecessor: ethers.constants.HashZero,
        salt: ethers.utils.randomBytes(32),
        delay,
      };

      postTxParameter = {
        target,
        value,
        data,
        salt: ethers.utils.randomBytes(32),
        delay,
      };
    });

    it("is impossible to execute transaction when predecessor is not 0, and not executed", async () => {
      const predecessorTxId = await timeLockedMultiSig.hashOperation(
        predecessorTxParameter.target,
        predecessorTxParameter.value,
        predecessorTxParameter.data,
        predecessorTxParameter.predecessor,
        predecessorTxParameter.salt,
      );
      const predecessorTx = await timeLockedMultiSig
        .connect(proposers[0])
        .schedule(
          predecessorTxParameter.target,
          predecessorTxParameter.value,
          predecessorTxParameter.data,
          predecessorTxParameter.predecessor,
          predecessorTxParameter.salt,
          predecessorTxParameter.delay,
        );
      await predecessorTx.wait();

      const postTx = await timeLockedMultiSig
        .connect(proposers[0])
        .schedule(
          postTxParameter.target,
          postTxParameter.value,
          postTxParameter.data,
          predecessorTxId,
          postTxParameter.salt,
          postTxParameter.delay,
        );
      await postTx.wait();

      for (let i = 0; i < threshold; i++) {
        const preApproveTx = await timeLockedMultiSig
          .connect(approvers[i])
          .approve(
            predecessorTxParameter.target,
            predecessorTxParameter.value,
            predecessorTxParameter.data,
            predecessorTxParameter.predecessor,
            predecessorTxParameter.salt,
          );
        await preApproveTx.wait();
        const postApproveTx = await timeLockedMultiSig
          .connect(approvers[i])
          .approve(
            postTxParameter.target,
            postTxParameter.value,
            postTxParameter.data,
            predecessorTxId,
            postTxParameter.salt,
          );
        await postApproveTx.wait();
      }

      await expect(
        timeLockedMultiSig
          .connect(executors[0])
          .execute(
            postTxParameter.target,
            postTxParameter.value,
            postTxParameter.data,
            predecessorTxId,
            postTxParameter.salt,
          ),
      ).revertedWith("TimelockController: missing dependency");
    });
    it("is possible to execute transaction when predecessor is executed", async () => {
      const predecessorTxId = await timeLockedMultiSig.hashOperation(
        predecessorTxParameter.target,
        predecessorTxParameter.value,
        predecessorTxParameter.data,
        predecessorTxParameter.predecessor,
        predecessorTxParameter.salt,
      );
      const preExecuteTx = await timeLockedMultiSig
        .connect(executors[0])
        .execute(
          predecessorTxParameter.target,
          predecessorTxParameter.value,
          predecessorTxParameter.data,
          predecessorTxParameter.predecessor,
          predecessorTxParameter.salt,
        );
      await preExecuteTx.wait();
      const postExecuteTx = await timeLockedMultiSig
        .connect(executors[0])
        .execute(
          postTxParameter.target,
          postTxParameter.value,
          postTxParameter.data,
          predecessorTxId,
          postTxParameter.salt,
        );
      await postExecuteTx.wait();

      const balance = await testToken.balanceOf(tokenReceiver.address);
      expect(balance.toNumber()).to.equal(60);
    });
  });
  describe("UpdateDelay", () => {
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
      data = timeLockedMultiSig.interface.encodeFunctionData("updateDelay", [
        10,
      ]);
      predecessor = ethers.constants.HashZero;
      delay = 1;
    });

    it("should update delay by TimeLockedMultiSig itself", async () => {
      await timeLockedMultiSigTransactionProcess(
        timeLockedMultiSig,
        proposers[0],
        approvers,
        executors[0],
        threshold,
        target,
        value,
        data,
        predecessor,
        salt,
        delay,
      );
    });
  });
  describe("execute tx before delay and cancel it", () => {
    let salt: Uint8Array;
    let target: string;
    let value: number;
    let data: string;
    let predecessor: string;
    let delay: number;
    before(() => {
      salt = ethers.utils.randomBytes(32);
      target = testToken.address;
      value = 0;
      data = testToken.interface.encodeFunctionData("mint", [
        tokenReceiver.address,
        20,
      ]);
      predecessor = ethers.constants.HashZero;
      delay = 10;
    });

    it("is impossible to execute tx before delay", async () => {
      const tx = await timeLockedMultiSig
        .connect(proposers[0])
        .schedule(target, value, data, predecessor, salt, delay);
      await tx.wait();

      for (let i = 0; i < threshold; i++) {
        const tx = await timeLockedMultiSig
          .connect(approvers[i])
          .approve(target, value, data, predecessor, salt);
        await tx.wait();
      }

      await expect(
        timeLockedMultiSig
          .connect(executors[0])
          .execute(target, value, data, predecessor, salt),
      ).revertedWith("TimelockController: operation is not ready");
    });

    it("is possible to cancel tx before execution", async () => {
      const id = await timeLockedMultiSig.hashOperation(
        target,
        value,
        data,
        predecessor,
        salt,
      );
      const tx = await timeLockedMultiSig.connect(proposers[0]).cancel(id);
      await tx.wait();
      await expect(tx).emit(timeLockedMultiSig, "Cancelled");
    });

    it("is possible to execute tx after delay", async () => {
      const newSalt = ethers.utils.randomBytes(32);
      const tx = await timeLockedMultiSig
        .connect(proposers[0])
        .schedule(target, value, data, predecessor, newSalt, delay);
      await tx.wait();

      for (let i = 0; i < threshold; i++) {
        const tx = await timeLockedMultiSig
          .connect(approvers[i])
          .approve(target, value, data, predecessor, newSalt);
        await tx.wait();
      }

      await sleep(10);

      const executeTx = await timeLockedMultiSig
        .connect(executors[0])
        .execute(target, value, data, predecessor, newSalt);
      await executeTx.wait();

      const balance = await testToken.balanceOf(tokenReceiver.address);
      expect(balance.toNumber()).to.equal(80);
    });
  });
});
