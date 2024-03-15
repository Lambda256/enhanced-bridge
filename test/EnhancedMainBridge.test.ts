import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  createRegisterSideBridgeData,
  createRegisterSideTokenData,
  deployEnhancedMainBridge,
  deploySideBridge,
  EnhancedProxyEventMatcher,
  waitProxyTransactionResponse,
} from "./test.helper";
import { expect } from "chai";
import { EnhancedERC1967Proxy, EnhancedMainBridge, ERC20Token } from "../typechain-types";
import { BigNumber } from "ethers";
import { EnhancedMainBridgeInterface } from "../typechain-types/contracts/EnhancedMainBridge";

describe("EnhancedMainBridge", () => {
  const sideChainId = 1024;
  const sideTokenName = "Side Token";
  const sideTokenSymbol = "PTKs";
  const conversionRate = 10;
  const conversionRateDecimals = 0;
  const mainChainId = 1000;

  let enhancedMainBridge: EnhancedMainBridge;
  let enhancedMainBridgeInterface: EnhancedMainBridgeInterface;
  let owner: SignerWithAddress;
  let authorities: string[];
  let mainAdmin: SignerWithAddress;
  let lambdaOperator: SignerWithAddress;
  let accounts: SignerWithAddress[];

  before(async () => {
    accounts = await ethers.getSigners();
    owner = accounts[0];
    authorities = [
      accounts[5].address,
      accounts[6].address,
      accounts[7].address,
    ];
    mainAdmin = accounts[8];
    lambdaOperator = accounts[1];

    const EnhancedMainBridge = await ethers.getContractFactory("EnhancedMainBridge");
    enhancedMainBridge = await EnhancedMainBridge.deploy();
    await enhancedMainBridge.deployed();
    enhancedMainBridgeInterface = enhancedMainBridge.interface;
  });

  describe("registerSideBridge", () => {
    it("should pass if owner register a valid sideBridge", async () => {
      // given
      const proxy = await deployEnhancedMainBridge(mainChainId, mainAdmin);
      const sideBridge = await deploySideBridge(
        lambdaOperator,
        mainChainId,
        proxy.address,
        sideChainId,
        authorities,
      );

      const registerSideBridgeData = createRegisterSideBridgeData(
        enhancedMainBridgeInterface,
        sideBridge.address,
        2,
        authorities,
      );

      // when
      const receipt = await waitProxyTransactionResponse(
        proxy.fallback.bind(proxy),
        {
          data: registerSideBridgeData,
        },
      );

      // then
      await EnhancedProxyEventMatcher.emit(
        receipt,
        "SideBridgeRegistered",
      ).withArgs(sideBridge.address, authorities);
    });

    it("should be reverted if registered by not owner", async () => {
      // given
      const proxy = await deployEnhancedMainBridge(mainChainId, mainAdmin);
      const noneOwnerAddress = accounts[2];
      const sideBridge = await deploySideBridge(
        lambdaOperator,
        mainChainId,
        proxy.address,
        sideChainId,
        authorities,
      );

      const registerSideBridgeData = createRegisterSideBridgeData(
        enhancedMainBridgeInterface,
        sideBridge.address,
        2,
        authorities,
      );

      // when, then
      await expect(
        proxy.connect(noneOwnerAddress).fallback({
          data: registerSideBridgeData,
        }),
      ).revertedWithCustomError(enhancedMainBridge, "OwnableUnauthorizedAccount");
    });

    it("should be reverted when authorities.length is greater than or equal to 256", async () => {
      // given
      const proxy = await deployEnhancedMainBridge(mainChainId, mainAdmin);
      const tooManyAuthorities = Array(256).fill(accounts[5].address);
      const sideBridge = await deploySideBridge(
        lambdaOperator,
        mainChainId,
        proxy.address,
        sideChainId,
        authorities,
      );

      const registerSideBridgeData = createRegisterSideBridgeData(
        enhancedMainBridgeInterface,
        sideBridge.address,
        150,
        tooManyAuthorities,
      );

      // when, then
      await expect(
        proxy.fallback({
          data: registerSideBridgeData,
        }),
      ).revertedWithoutReason();
    });

    it("should be reverted if requiredSignature is 0", async () => {
      // given
      const proxy = await deployEnhancedMainBridge(mainChainId, mainAdmin);
      const requiredSignature = 0;

      const sideBridge = await deploySideBridge(
        lambdaOperator,
        mainChainId,
        proxy.address,
        sideChainId,
        authorities,
      );

      const registerSideBridgeData = createRegisterSideBridgeData(
        enhancedMainBridgeInterface,
        sideBridge.address,
        requiredSignature,
        authorities,
      );

      // when, then
      await expect(
        proxy.fallback({
          data: registerSideBridgeData,
        }),
      ).revertedWithoutReason();
    });

    it("should be reverted if requiredSignature is less than or equal to authorities.length / 2", async () => {
      // given
      const proxy = await deployEnhancedMainBridge(mainChainId, mainAdmin);
      const requiredSignature = Math.floor(authorities.length / 2);

      const sideBridge = await deploySideBridge(
        lambdaOperator,
        mainChainId,
        proxy.address,
        sideChainId,
        authorities,
      );

      const registerSideBridgeData = createRegisterSideBridgeData(
        enhancedMainBridgeInterface,
        sideBridge.address,
        requiredSignature,
        authorities,
      );

      // when, then
      await expect(
        proxy.fallback({
          data: registerSideBridgeData,
        }),
      ).revertedWithoutReason();
    });

    it("should be reverted if requiredSignature is greater than authorities.length", async () => {
      // given
      const proxy = await deployEnhancedMainBridge(mainChainId, mainAdmin);

      const sideBridge = await deploySideBridge(
        lambdaOperator,
        mainChainId,
        proxy.address,
        sideChainId,
        authorities,
      );

      const registerSideBridgeData = createRegisterSideBridgeData(
        enhancedMainBridgeInterface,
        sideBridge.address,
        authorities.length + 1,
        authorities,
      );

      // when, then
      await expect(
        proxy.fallback({
          data: registerSideBridgeData,
        }),
      ).revertedWithoutReason();
    });

    it("should be reverted if sideBridge address is invalid", async () => {
      // given
      const proxy = await deployEnhancedMainBridge(mainChainId, mainAdmin);
      const invalidSideBridgeAddress = ethers.constants.AddressZero;

      const sideBridge = await deploySideBridge(
        lambdaOperator,
        mainChainId,
        proxy.address,
        sideChainId,
        authorities,
      );

      const registerSideBridgeData = createRegisterSideBridgeData(
        enhancedMainBridgeInterface,
        invalidSideBridgeAddress,
        authorities.length + 1,
        authorities,
      );

      // when, then
      await expect(
        proxy.fallback({
          data: registerSideBridgeData,
        }),
      ).revertedWithoutReason();
    });
  });
  describe("registerSideToken", () => {
    let proxy: EnhancedERC1967Proxy;
    let sideTokenId: string;
    beforeEach(async () => {
      proxy = await deployEnhancedMainBridge(mainChainId, mainAdmin);
      const sideTokenIdData = enhancedMainBridgeInterface.encodeFunctionData(
        "hashSideTokenId",
        [
          sideChainId,
          sideTokenName,
          sideTokenSymbol,
          conversionRate,
          conversionRateDecimals,
        ],
      );
      sideTokenId = await ethers.provider.call({
        to: proxy.address,
        data: sideTokenIdData,
      });
    });
    it("should emit SideTokenRegistered event when registered", async () => {
      // given
      const registerSideTokenData = createRegisterSideTokenData(
        enhancedMainBridgeInterface,
        sideChainId,
        sideTokenName,
        sideTokenSymbol,
        conversionRate,
        conversionRateDecimals,
        sideTokenId,
      );

      // when
      const receipt = await waitProxyTransactionResponse(
        proxy.fallback.bind(proxy),
        {
          data: registerSideTokenData,
        },
      );

      // then
      await EnhancedProxyEventMatcher.emit(receipt, "SideTokenRegistered").withArgs(
        sideTokenId,
        sideChainId,
        sideTokenName,
        sideTokenSymbol,
        conversionRate,
        conversionRateDecimals,
        BigNumber.from(18),
      );
    });
    it("should not add a Side Token when the transaction is not from the owner", async () => {
      // given
      const registerSideTokenData = createRegisterSideTokenData(
        enhancedMainBridgeInterface,
        sideChainId,
        sideTokenName,
        sideTokenSymbol,
        conversionRate,
        conversionRateDecimals,
        sideTokenId,
      );

      // when, then
      await expect(
        proxy.connect(accounts[1]).fallback({
          data: registerSideTokenData,
        }),
      )
        .revertedWithCustomError(enhancedMainBridge, "OwnableUnauthorizedAccount")
        .withArgs(accounts[1].address);
    });
    it("should not add a Side Token when sideTokenId not matched", async () => {
      // given
      const differentTokenName = `${sideTokenName}DIFF`;

      const registerSideTokenData = createRegisterSideTokenData(
        enhancedMainBridgeInterface,
        sideChainId,
        differentTokenName,
        sideTokenSymbol,
        conversionRate,
        conversionRateDecimals,
        sideTokenId,
      );

      // when, then
      await expect(
        proxy.fallback({
          data: registerSideTokenData,
        }),
      ).revertedWithoutReason();
    });

    it("should not add a Side Token when name is empty", async () => {
      // given
      const emptyTokenName = "";

      const registerSideTokenData = createRegisterSideTokenData(
        enhancedMainBridgeInterface,
        sideChainId,
        emptyTokenName,
        sideTokenSymbol,
        conversionRate,
        conversionRateDecimals,
        sideTokenId,
      );

      // when, then
      await expect(
        proxy.fallback({
          data: registerSideTokenData,
        }),
      ).revertedWithoutReason();
    });

    it("should not add a Side Token when symbol is empty", async () => {
      // given
      const emptyTokenSymbol = "";

      const registerSideTokenData = createRegisterSideTokenData(
        enhancedMainBridgeInterface,
        sideChainId,
        sideTokenName,
        emptyTokenSymbol,
        conversionRate,
        conversionRateDecimals,
        sideTokenId,
      );

      // when, then
      await expect(
        proxy.fallback({
          data: registerSideTokenData,
        }),
      ).revertedWithoutReason();
    });

    it("should not add a Side Token when symbol is too long", async () => {
      // given
      const tooLongTokenSymbol = "12345678";
      const registerSideTokenData = createRegisterSideTokenData(
        enhancedMainBridgeInterface,
        sideChainId,
        sideTokenName,
        tooLongTokenSymbol,
        conversionRate,
        conversionRateDecimals,
        sideTokenId,
      );

      // when, then
      await expect(
        proxy.fallback({
          data: registerSideTokenData,
        }),
      ).revertedWithoutReason();
    });
  });
  describe("deposit", () => {
    let proxy: EnhancedERC1967Proxy;
    let mainToken: ERC20Token;
    let sideTokenId: string;
    const DEPOSIT_AMOUNT = 1000;
    beforeEach(async () => {
      proxy = await deployEnhancedMainBridge(mainChainId, mainAdmin);

      const mainTokenData =
        enhancedMainBridgeInterface.encodeFunctionData("mainToken");
      const result = await ethers.provider.call({
        to: proxy.address,
        data: mainTokenData,
      });
      mainToken = await ethers.getContractAt(
        "ERC20Token",
        "0x" + result.slice(26, 66),
      );

      const sideTokenIdData = enhancedMainBridgeInterface.encodeFunctionData(
        "hashSideTokenId",
        [
          sideChainId,
          sideTokenName,
          sideTokenSymbol,
          conversionRate,
          conversionRateDecimals,
        ],
      );
      sideTokenId = await ethers.provider.call({
        to: proxy.address,
        data: sideTokenIdData,
      });

      const registerSideTokenData = createRegisterSideTokenData(
        enhancedMainBridgeInterface,
        sideChainId,
        sideTokenName,
        sideTokenSymbol,
        conversionRate,
        conversionRateDecimals,
        sideTokenId,
      );

      await waitProxyTransactionResponse(proxy.fallback.bind(proxy), {
        data: registerSideTokenData,
      });
    });
    it("should deposit successfully", async () => {
      // given
      const txResponse = await mainToken.approve(proxy.address, DEPOSIT_AMOUNT);
      await txResponse.wait();

      const depositData = enhancedMainBridgeInterface.encodeFunctionData(
        "deposit",
        [sideTokenId, DEPOSIT_AMOUNT],
      );

      // when
      const receipt = await waitProxyTransactionResponse(
        proxy.fallback.bind(proxy),
        {
          data: depositData,
        },
      );

      // then
      EnhancedProxyEventMatcher.emit(receipt, "Deposited");
    });
    it("should deposit successfully with approveAndCall", async () => {
      // given, when
      const txResponse = await mainToken.approveAndCall(
        proxy.address,
        DEPOSIT_AMOUNT,
        sideTokenId,
      );

      const receipt = await txResponse.wait();

      // then
      EnhancedProxyEventMatcher.emit(receipt, "Deposited");
    });
    it("should deposit successfully with ownerDeposit", async () => {
      // given
      const transferTxResp = await mainToken.transfer(
        accounts[1].address,
        DEPOSIT_AMOUNT,
      );
      await transferTxResp.wait();

      const approveTxResp = await mainToken
        .connect(accounts[1])
        .approve(proxy.address, DEPOSIT_AMOUNT);
      await approveTxResp.wait();

      // when
      const ownerDepositData = enhancedMainBridgeInterface.encodeFunctionData(
        "ownerDeposit",
        [accounts[1].address, sideTokenId, DEPOSIT_AMOUNT],
      );
      const receipt = await waitProxyTransactionResponse(
        proxy.fallback.bind(proxy),
        {
          data: ownerDepositData,
        },
      );

      // then
      EnhancedProxyEventMatcher.emit(receipt, "Deposited");
    });
    it("should fail when approved amount is less than requested amount", async () => {
      // given
      const txResponse = await mainToken.approve(
        proxy.address,
        DEPOSIT_AMOUNT - 1,
      );
      await txResponse.wait();

      const depositData = enhancedMainBridgeInterface.encodeFunctionData(
        "deposit",
        [sideTokenId, DEPOSIT_AMOUNT],
      );

      // when, then
      await expect(
        proxy.fallback({
          data: depositData,
        }),
      ).revertedWithoutReason();
    });
    it("should be reverted for invalid side token", async () => {
      // given
      const ZERO_PRODUCT_TOKEN_ID =
        "0x0000000000000000000000000000000000000000000000000000000000000000";
      const depositData = enhancedMainBridgeInterface.encodeFunctionData(
        "deposit",
        [ZERO_PRODUCT_TOKEN_ID, DEPOSIT_AMOUNT],
      );

      // when, then
      await expect(
        proxy.fallback({
          data: depositData,
        }),
      ).revertedWithoutReason();
    });
    it("should be reverted for zero amount", async () => {
      // given
      const ZERO_AMOUNT = 0;
      const depositData = enhancedMainBridgeInterface.encodeFunctionData(
        "deposit",
        [sideTokenId, ZERO_AMOUNT],
      );

      // when, then
      await expect(
        proxy.fallback({
          data: depositData,
        }),
      ).revertedWithoutReason();
    });
    it("should be reverted for not registered", async () => {
      // given
      const tokenNameNotRegistered = `${sideTokenName}_NOT_REGISTERED`;

      const sideTokenIdData = enhancedMainBridgeInterface.encodeFunctionData(
        "hashSideTokenId",
        [
          sideChainId,
          tokenNameNotRegistered,
          sideTokenSymbol,
          conversionRate,
          conversionRateDecimals,
        ],
      );
      const notRegisteredSideTokenId = await ethers.provider.call({
        to: proxy.address,
        data: sideTokenIdData,
      });

      const depositData = enhancedMainBridgeInterface.encodeFunctionData(
        "deposit",
        [notRegisteredSideTokenId, 100],
      );

      // when, then
      await expect(
        proxy.fallback({
          data: depositData,
        }),
      ).revertedWithoutReason();
    });
    it("should be reverted if nonOwner calls ownerDeposit", async () => {
      // given
      const transferTxResp = await mainToken.transfer(
        accounts[1].address,
        DEPOSIT_AMOUNT,
      );
      await transferTxResp.wait();
      const approveTxResp = await mainToken
        .connect(accounts[1])
        .approve(proxy.address, DEPOSIT_AMOUNT);
      await approveTxResp.wait();

      const ownerDepositData = enhancedMainBridgeInterface.encodeFunctionData(
        "ownerDeposit",
        [accounts[1].address, sideTokenId, DEPOSIT_AMOUNT],
      );

      // when, then
      await expect(
        proxy.connect(accounts[2]).fallback({
          data: ownerDepositData,
        }),
      ).revertedWithCustomError(enhancedMainBridge, "OwnableUnauthorizedAccount");
    });
    it("should be reverted if bridge is paused and deposit is called", async () => {
      // given
      const txResponse = await mainToken.approve(proxy.address, DEPOSIT_AMOUNT);
      await txResponse.wait();

      const pauseBridgeData =
        enhancedMainBridgeInterface.encodeFunctionData("pauseBridge");
      await waitProxyTransactionResponse(proxy.fallback.bind(proxy), {
        data: pauseBridgeData,
      });

      const depositData = enhancedMainBridgeInterface.encodeFunctionData(
        "deposit",
        [sideTokenId, DEPOSIT_AMOUNT],
      );
      const ownerDepositData = enhancedMainBridgeInterface.encodeFunctionData(
        "ownerDeposit",
        [accounts[5].address, sideTokenId, 100],
      );

      // when, then
      await expect(
        proxy.fallback({
          data: depositData,
        }),
      ).revertedWithoutReason();

      await expect(
        proxy.fallback({
          data: ownerDepositData,
        }),
      ).revertedWithoutReason();
    });
  });
  describe("stake", () => {
    let proxy: EnhancedERC1967Proxy;
    let mainToken: ERC20Token;
    let staker: SignerWithAddress;
    beforeEach(async () => {
      staker = accounts[0];
      proxy = await deployEnhancedMainBridge(mainChainId, mainAdmin);

      const mainTokenData =
        enhancedMainBridgeInterface.encodeFunctionData("mainToken");
      const result = await ethers.provider.call({
        to: proxy.address,
        data: mainTokenData,
      });
      mainToken = await ethers.getContractAt(
        "ERC20Token",
        "0x" + result.slice(26, 66),
      );
    });
    it("should succeed when a user stake token equal to the approved amount", async () => {
      // given
      const stakingAmount = BigNumber.from(100);
      const previousBalanceOfMainBridge = await mainToken.balanceOf(
        proxy.address,
      );
      const previousBalanceOfStaker = await mainToken.balanceOf(staker.address);

      const txResponse = await mainToken
        .connect(staker)
        .approve(proxy.address, stakingAmount);
      await txResponse.wait();

      const stakeData = enhancedMainBridgeInterface.encodeFunctionData("stake", [
        stakingAmount,
      ]);
      await waitProxyTransactionResponse(proxy.fallback.bind(proxy), {
        data: stakeData,
      });

      // when
      const balanceOfMainBridge = await mainToken.balanceOf(proxy.address);
      const balanceOfStaker = await mainToken.balanceOf(staker.address);
      const stakeAmountData = enhancedMainBridgeInterface.encodeFunctionData(
        "stakedAmount",
        [staker.address],
      );
      const stakedAmount = await ethers.provider.call({
        to: proxy.address,
        data: stakeAmountData,
      });

      // then
      expect(balanceOfMainBridge).to.equal(
        previousBalanceOfMainBridge.add(stakingAmount),
      );
      expect(balanceOfStaker).to.equal(
        previousBalanceOfStaker.sub(stakingAmount),
      );
      expect(stakedAmount).to.equal(stakingAmount);
    });
    it("should fail when a user stake the amount of zero", async () => {
      // given
      const stakingAmount = BigNumber.from(0);

      const stakeData = enhancedMainBridgeInterface.encodeFunctionData("stake", [
        stakingAmount,
      ]);

      // when, data
      await expect(
        proxy.connect(staker).fallback({
          data: stakeData,
        }),
      ).revertedWithoutReason();
    });
    it("should fail when a user stake more than the approved amount", async () => {
      // given
      const approvingAmount = BigNumber.from(100);

      const txResponse = await mainToken
        .connect(staker)
        .approve(proxy.address, approvingAmount);
      await txResponse.wait();

      const allowance = await mainToken.allowance(
        staker.address,
        proxy.address,
      );

      const stakingAmount = approvingAmount.add(1);

      const stakeData = enhancedMainBridgeInterface.encodeFunctionData("stake", [
        stakingAmount,
      ]);

      // when, then
      await expect(
        proxy.connect(staker).fallback({
          data: stakeData,
        }),
      ).revertedWithoutReason();
    });
  });
  describe("unstake", () => {
    let proxy: EnhancedERC1967Proxy;
    let mainToken: ERC20Token;
    let staker: SignerWithAddress;
    beforeEach(async () => {
      staker = accounts[0];
      proxy = await deployEnhancedMainBridge(mainChainId, mainAdmin);

      const mainTokenData =
        enhancedMainBridgeInterface.encodeFunctionData("mainToken");
      const result = await ethers.provider.call({
        to: proxy.address,
        data: mainTokenData,
      });
      mainToken = await ethers.getContractAt(
        "ERC20Token",
        "0x" + result.slice(26, 66),
      );
    });
    it("should succeed when unstaking amount is less than or equal to the staked amount", async () => {
      // given
      const stakingAmount = BigNumber.from(100);
      const txResponse = await mainToken
        .connect(staker)
        .approve(proxy.address, stakingAmount);
      await txResponse.wait();

      const stakeData = enhancedMainBridgeInterface.encodeFunctionData("stake", [
        stakingAmount,
      ]);
      await waitProxyTransactionResponse(
        proxy.connect(staker).fallback.bind(proxy),
        {
          data: stakeData,
        },
      );

      const stakedAmountData = enhancedMainBridgeInterface.encodeFunctionData(
        "stakedAmount",
        [staker.address],
      );
      const afterStakedAmount = await ethers.provider.call({
        to: proxy.address,
        data: stakedAmountData,
      });

      // when
      const unstakeData = enhancedMainBridgeInterface.encodeFunctionData(
        "unstake",
        [afterStakedAmount],
      );
      const receipt = await waitProxyTransactionResponse(
        proxy.connect(staker).fallback.bind(proxy),
        {
          data: unstakeData,
        },
      );

      const afterUnstakedAmount = await ethers.provider.call({
        to: proxy.address,
        data: stakedAmountData,
      });

      // then
      expect(parseInt(afterUnstakedAmount)).to.equal(0);
      EnhancedProxyEventMatcher.emit(receipt, "Unstaked");
    });
    it("should fail when unstaking amount is larger than the staked amount", async () => {
      // given
      const stakedAmountData = enhancedMainBridgeInterface.encodeFunctionData(
        "stakedAmount",
        [staker.address],
      );
      const stakedAmount = await ethers.provider.call({
        to: proxy.address,
        data: stakedAmountData,
      });
      const moreAmount = BigNumber.from(stakedAmount).add(1);

      const unstakeAMount = enhancedMainBridgeInterface.encodeFunctionData(
        "unstake",
        [moreAmount],
      );

      // when, then
      await expect(
        proxy.connect(staker).fallback({
          data: unstakeAMount,
        }),
      ).revertedWithoutReason();
    });
    it("should fail when unstaking amount is 0", async () => {
      // given
      const zeroAmount = BigNumber.from(0);

      const unstakeData = enhancedMainBridgeInterface.encodeFunctionData(
        "unstake",
        [zeroAmount],
      );

      // when, then
      await expect(
        proxy.connect(staker).fallback({
          data: unstakeData,
        }),
      ).revertedWithoutReason();
    });
  });
  describe("Pause/Resume", () => {
    let proxy: EnhancedERC1967Proxy;
    let mainToken: ERC20Token;
    let operator: SignerWithAddress;
    let isPausedData: string;
    let pauseBridgeData: string;
    let resumeBridgeData: string;
    beforeEach(async () => {
      operator = accounts[0];
      proxy = await deployEnhancedMainBridge(mainChainId, mainAdmin);

      const mainTokenData =
        enhancedMainBridgeInterface.encodeFunctionData("mainToken");
      const result = await ethers.provider.call({
        to: proxy.address,
        data: mainTokenData,
      });
      mainToken = await ethers.getContractAt(
        "ERC20Token",
        "0x" + result.slice(26, 66),
      );

      isPausedData = enhancedMainBridgeInterface.encodeFunctionData("isPaused");
      pauseBridgeData =
        enhancedMainBridgeInterface.encodeFunctionData("pauseBridge");
      resumeBridgeData =
        enhancedMainBridgeInterface.encodeFunctionData("resumeBridge");
    });

    it("should pause when isPaused == false and mainAdmin calls pauseBridge", async () => {
      const isPaused = await ethers.provider.call({
        to: proxy.address,
        data: isPausedData,
      });

      await waitProxyTransactionResponse(
        proxy.connect(mainAdmin).fallback.bind(proxy),
        {
          data: pauseBridgeData,
        },
      );

      const postPauseValue = await ethers.provider.call({
        to: proxy.address,
        data: isPausedData,
      });

      expect(parseInt(isPaused)).to.equal(0); // false
      expect(parseInt(postPauseValue)).to.equal(1); // true
    });
    it("should pause when isPaused == false and operator(owner) calls pauseBridge", async () => {
      const isPaused = await ethers.provider.call({
        to: proxy.address,
        data: isPausedData,
      });

      await waitProxyTransactionResponse(
        proxy.connect(operator).fallback.bind(proxy),
        {
          data: pauseBridgeData,
        },
      );

      const postPauseValue = await ethers.provider.call({
        to: proxy.address,
        data: isPausedData,
      });

      expect(parseInt(isPaused)).to.equal(0); // false
      expect(parseInt(postPauseValue)).to.equal(1); // true
    });
    it("should resume when isPaused == true and mainAdmin calls resumeBridge", async () => {
      const isPaused = await ethers.provider.call({
        to: proxy.address,
        data: isPausedData,
      });

      await waitProxyTransactionResponse(
        proxy.connect(mainAdmin).fallback.bind(proxy),
        {
          data: pauseBridgeData,
        },
      );

      const postPauseValue = await ethers.provider.call({
        to: proxy.address,
        data: isPausedData,
      });

      await waitProxyTransactionResponse(
        proxy.connect(mainAdmin).fallback.bind(proxy),
        {
          data: resumeBridgeData,
        },
      );

      const postResumeValue = await ethers.provider.call({
        to: proxy.address,
        data: isPausedData,
      });

      expect(parseInt(isPaused)).to.equal(0); // false
      expect(parseInt(postPauseValue)).to.equal(1); // true
      expect(parseInt(postResumeValue)).to.equal(0); // false
    });
    it("should resume when isPaused == true and operator(owner) calls resumeBridge", async () => {
      const prevPausedValue = await ethers.provider.call({
        to: proxy.address,
        data: isPausedData,
      });

      await waitProxyTransactionResponse(
        proxy.connect(operator).fallback.bind(proxy),
        {
          data: pauseBridgeData,
        },
      );

      const postPauseValue = await ethers.provider.call({
        to: proxy.address,
        data: isPausedData,
      });

      await waitProxyTransactionResponse(
        proxy.connect(operator).fallback.bind(proxy),
        {
          data: resumeBridgeData,
        },
      );

      const postResumeValue = await ethers.provider.call({
        to: proxy.address,
        data: isPausedData,
      });

      expect(parseInt(prevPausedValue)).to.equal(0); // false
      expect(parseInt(postPauseValue)).to.equal(1); // true
      expect(parseInt(postResumeValue)).to.equal(0); // false
    });
    it("should fail when isPaused == false and mainAdmin calls resumeBridge", async () => {
      const prevPausedValue = await ethers.provider.call({
        to: proxy.address,
        data: isPausedData,
      });

      await expect(
        proxy.fallback({
          data: resumeBridgeData,
        }),
      ).revertedWithoutReason();
    });
    it("should fail when mainAdmin calls pauseBridge eventhough mainBridge is already paused", async () => {
      const prevPausedValue = await ethers.provider.call({
        to: proxy.address,
        data: isPausedData,
      });

      await waitProxyTransactionResponse(
        proxy.connect(mainAdmin).fallback.bind(proxy),
        {
          data: pauseBridgeData,
        },
      );

      const postPauseValue = await ethers.provider.call({
        to: proxy.address,
        data: isPausedData,
      });

      await expect(
        proxy.connect(mainAdmin).fallback({
          data: pauseBridgeData,
        }),
      ).revertedWithoutReason();
      expect(parseInt(prevPausedValue)).to.equal(0); // false
      expect(parseInt(postPauseValue)).to.equal(1); // true
    });
    it("should fail when msg.sender is not mainAdmin and owner", async () => {
      const prevPausedValue = await ethers.provider.call({
        to: proxy.address,
        data: isPausedData,
      });

      await expect(
        proxy.connect(accounts[1]).fallback({
          data: pauseBridgeData,
        }),
      ).revertedWithoutReason();
      expect(parseInt(prevPausedValue)).to.equal(0); // false
    });
    describe("Paused", () => {
      it("should fail when isPaused == true && other contract functions called", async () => {
        const pausedBridgeProxy = await deployEnhancedMainBridge(
          mainChainId,
          mainAdmin,
        );

        await waitProxyTransactionResponse(
          pausedBridgeProxy.connect(mainAdmin).fallback.bind(pausedBridgeProxy),
          {
            data: pauseBridgeData,
          },
        );

        const sideBridge = await deploySideBridge(
          lambdaOperator,
          mainChainId,
          pausedBridgeProxy.address,
          sideChainId,
          authorities,
        );

        const registerSideBridgeData = createRegisterSideBridgeData(
          enhancedMainBridgeInterface,
          sideBridge.address,
          2,
          authorities,
        );

        await expect(
          pausedBridgeProxy.fallback({
            data: registerSideBridgeData,
          }),
        ).revertedWithoutReason();
      });
    });
  });
});
