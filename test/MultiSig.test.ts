import { MultiSig, MultiSigTxTest } from "../typechain-types";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { createTxId } from "./test.helper";

function createValidatorTxId(
  oldValidator: string,
  newValidator: string,
  threshold: number,
  changeValidatorCount: number,
) {
  const packed = ethers.utils.solidityPack(
    ["address", "address", "uint256", "uint256"],
    [oldValidator, newValidator, threshold, changeValidatorCount],
  );

  return ethers.utils.keccak256(packed);
}

describe("MultiSig", () => {
  let multiSig: MultiSig;
  let validator1: SignerWithAddress;
  let validator2: SignerWithAddress;
  let validator3: SignerWithAddress;
  let validator4: SignerWithAddress;

  before(async () => {
    const signers = await ethers.getSigners();
    validator1 = signers[0];
    validator2 = signers[1];
    validator3 = signers[2];
    validator4 = signers[3];

    const MultiSig = await ethers.getContractFactory("MultiSig");
    multiSig = await MultiSig.deploy(
      [validator1.address, validator2.address],
      2,
    );
    await multiSig.deployed();
  });

  it("should have the correct validators", async () => {
    const validators = await multiSig.getValidators();
    const requiredSignatures = 2;
    const count = await multiSig.requiredSignatureCount();

    expect(validators).to.eql([validator1.address, validator2.address]);
    expect(count.toNumber()).to.equal(requiredSignatures);
  });

  it("add validator and check correct validator and required signature count", async () => {
    const tx = await multiSig.addValidatorRequest(validator3.address, 3);
    await tx.wait();

    const updateId = createValidatorTxId(
      ethers.constants.AddressZero,
      validator3.address,
      3,
      1,
    );

    const confirm1 = await multiSig
      .connect(validator1)
      .approveChangeValidatorRequest(updateId);
    await confirm1.wait();
    const updateStatusBefore =
      await multiSig.getUpdateValidatorStatus(updateId);
    expect(updateStatusBefore[0]).to.equal(false);

    const confirm2 = await multiSig
      .connect(validator2)
      .approveChangeValidatorRequest(updateId);
    await confirm2.wait();
    const updateStatus = await multiSig.getUpdateValidatorStatus(updateId);
    expect(updateStatus[0]).to.equal(true);

    const count = await multiSig.requiredSignatureCount();
    expect(count.toNumber()).to.equal(3);
  });

  it("remove validator and check correct validator and required signature count", async () => {
    const tx = await multiSig.deleteValidatorRequest(validator3.address, 2);
    await tx.wait();

    const updateId = createValidatorTxId(
      validator3.address,
      ethers.constants.AddressZero,
      2,
      2,
    );

    const confirm1 = await multiSig
      .connect(validator3)
      .approveChangeValidatorRequest(updateId);
    await confirm1.wait();

    const confirm2 = await multiSig
      .connect(validator1)
      .approveChangeValidatorRequest(updateId);
    await confirm2.wait();

    const confirm3 = await multiSig
      .connect(validator2)
      .approveChangeValidatorRequest(updateId);
    await confirm3.wait();

    const updateStatus = await multiSig.getUpdateValidatorStatus(updateId);
    expect(updateStatus[0]).to.equal(true);
    const count = await multiSig.requiredSignatureCount();
    expect(count.toNumber()).to.equal(2);
  });

  it("update validator and check correct validator and required signature count", async () => {
    const tx = await multiSig.updateValidatorRequest(
      validator1.address,
      validator4.address,
      2,
    );
    await tx.wait();

    const updateId = createValidatorTxId(
      validator1.address,
      validator4.address,
      2,
      3,
    );

    const confirm1 = await multiSig
      .connect(validator2)
      .approveChangeValidatorRequest(updateId);
    await confirm1.wait();
    const updateStatusBefore =
      await multiSig.getUpdateValidatorStatus(updateId);
    expect(updateStatusBefore[0]).to.equal(false);

    const confirm2 = await multiSig
      .connect(validator1)
      .approveChangeValidatorRequest(updateId);
    await confirm2.wait();
    const updateStatus = await multiSig.getUpdateValidatorStatus(updateId);
    expect(updateStatus[0]).to.equal(true);

    const count = await multiSig.requiredSignatureCount();
    expect(count.toNumber()).to.equal(2);
  });

  describe("Transaction", () => {
    let multiSigTxtTest: MultiSigTxTest;
    before(async () => {
      const MultiSigTxTest = await ethers.getContractFactory("MultiSigTxTest");
      multiSigTxtTest = await MultiSigTxTest.deploy();
      await multiSigTxtTest.deployed();
    });

    it("submit transaction and check correct transaction status", async () => {
      const testData = multiSigTxtTest.interface.encodeFunctionData("test");
      const tx = await multiSig
        .connect(validator4)
        .submitTransaction(multiSigTxtTest.address, testData);
      await tx.wait();

      const txId = createTxId(multiSigTxtTest.address, testData, 1);

      const status = await multiSig.getTransactionStatus(txId);

      expect(status[0]).to.equal(false);
      expect(status[1].toNumber()).to.equal(0);
    });

    it("execute transaction and check correct transaction status", async () => {
      const testData = multiSigTxtTest.interface.encodeFunctionData("test");
      const txId = createTxId(multiSigTxtTest.address, testData, 1);

      const confirmTx1 = await multiSig
        .connect(validator2)
        .approveTransaction(txId);
      await confirmTx1.wait();
      const statusBefore = await multiSig.getTransactionStatus(txId);
      expect(statusBefore[0]).to.equal(false);
      expect(statusBefore[1].toNumber()).to.equal(1);

      const confirmTx2 = await multiSig
        .connect(validator4)
        .approveTransaction(txId);
      await confirmTx2.wait();
      const status = await multiSig.getTransactionStatus(txId);

      await expect(confirmTx2).to.emit(multiSigTxtTest, "Success");
      await expect(confirmTx2).to.emit(multiSig, "ExecuteTransaction");
      expect(status[0]).to.equal(true);
      expect(status[1].toNumber()).to.equal(2);
    });
    describe("execute transaction when validator changed", () => {
      it("submit transaction and check correct transaction status", async () => {
        const testData = multiSigTxtTest.interface.encodeFunctionData("test");
        const tx = await multiSig
          .connect(validator4)
          .submitTransaction(multiSigTxtTest.address, testData);
        await tx.wait();

        const txId = createTxId(multiSigTxtTest.address, testData, 2);

        const status = await multiSig.getTransactionStatus(txId);

        expect(status[0]).to.equal(false);
        expect(status[1].toNumber()).to.equal(0);
      });

      it("approve tx with old validator and update old validator with new validator", async () => {
        const testData = multiSigTxtTest.interface.encodeFunctionData("test");
        const txId = createTxId(multiSigTxtTest.address, testData, 2);

        const confirmTx1 = await multiSig
          .connect(validator2)
          .approveTransaction(txId);
        await confirmTx1.wait();

        const tx = await multiSig
          .connect(validator2)
          .updateValidatorRequest(validator2.address, validator1.address, 2);
        await tx.wait();

        const updateId = createValidatorTxId(
          validator2.address,
          validator1.address,
          2,
          4,
        );

        const confirm1 = await multiSig
          .connect(validator2)
          .approveChangeValidatorRequest(updateId);
        await confirm1.wait();
        const confirm2 = await multiSig
          .connect(validator4)
          .approveChangeValidatorRequest(updateId);
        await confirm2.wait();

        const validators = await multiSig.getValidators();
        const txStatus = await multiSig.getTransactionStatus(txId);

        expect(validators).to.eql([validator4.address, validator1.address]);
        expect(txStatus[0]).to.equal(false);
      });

      it("tx should not be executed although new validator approved tx", async () => {
        const testData = multiSigTxtTest.interface.encodeFunctionData("test");
        const txId = createTxId(multiSigTxtTest.address, testData, 2);

        const confirmTx = await multiSig
          .connect(validator1)
          .approveTransaction(txId);
        await confirmTx.wait();

        const txStatus = await multiSig.getTransactionStatus(txId);
        expect(txStatus[0]).to.equal(false);
      });

      it("tx should be executed when required number of current validators approved it", async () => {
        const testData = multiSigTxtTest.interface.encodeFunctionData("test");
        const txId = createTxId(multiSigTxtTest.address, testData, 2);

        const confirmTx = await multiSig
          .connect(validator4)
          .approveTransaction(txId);
        await confirmTx.wait();

        const txStatus = await multiSig.getTransactionStatus(txId);
        expect(txStatus[0]).to.equal(true);
      });
    });
  });
});
