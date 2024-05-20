import { MultiSig } from "../typechain-types";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";

function createUpdateId(
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
    const tx = await multiSig.addValidatorRequest(validator3.address, 2);
    await tx.wait();

    const updateId = createUpdateId(
      ethers.constants.AddressZero,
      validator3.address,
      2,
      0,
    );

    const confirm1 = await multiSig
      .connect(validator1)
      .confirmChangeValidatorRequest(updateId);
    await confirm1.wait();
    const updateStatusBefore =
      await multiSig.getUpdateValidatorStatus(updateId);
    expect(updateStatusBefore[0]).to.equal(false);

    const confirm2 = await multiSig
      .connect(validator2)
      .confirmChangeValidatorRequest(updateId);
    await confirm2.wait();
    const updateStatus = await multiSig.getUpdateValidatorStatus(updateId);
    expect(updateStatus[0]).to.equal(true);

    const count = await multiSig.requiredSignatureCount();
    expect(count.toNumber()).to.equal(2);
  });

  it("remove validator and check correct validator and required signature count", async () => {
    const tx = await multiSig.deleteValidatorRequest(validator3.address, 2);
    await tx.wait();

    const updateId = createUpdateId(
      validator3.address,
      ethers.constants.AddressZero,
      2,
      1,
    );

    const confirm1 = await multiSig
      .connect(validator3)
      .confirmChangeValidatorRequest(updateId);
    await confirm1.wait();
    const updateStatusBefore =
      await multiSig.getUpdateValidatorStatus(updateId);
    expect(updateStatusBefore[0]).to.equal(false);

    const confirm2 = await multiSig
      .connect(validator1)
      .confirmChangeValidatorRequest(updateId);
    await confirm2.wait();
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

    const updateId = createUpdateId(
      validator1.address,
      validator4.address,
      2,
      2,
    );

    const confirm1 = await multiSig
      .connect(validator2)
      .confirmChangeValidatorRequest(updateId);
    await confirm1.wait();
    const updateStatusBefore =
      await multiSig.getUpdateValidatorStatus(updateId);
    expect(updateStatusBefore[0]).to.equal(false);

    const confirm2 = await multiSig
      .connect(validator1)
      .confirmChangeValidatorRequest(updateId);
    await confirm2.wait();
    const updateStatus = await multiSig.getUpdateValidatorStatus(updateId);
    expect(updateStatus[0]).to.equal(true);

    const count = await multiSig.requiredSignatureCount();
    expect(count.toNumber()).to.equal(2);
  });
});