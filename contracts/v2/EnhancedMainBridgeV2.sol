// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../EIP20Standard.sol";
import "../HashUtils.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "../proxy/OwnableUpgradeable.sol";
import {EnhancedMainBridgeUpgradeable} from "../proxy/EnhancedMainBridgeUpgradeable.sol";

contract EnhancedMainBridgeV2 is EnhancedMainBridgeUpgradeable, OwnableUpgradeable, UUPSUpgradeable {
    uint8 constant TOKEN_DECIMALS = 18;

    /*
     * @warn you must declare new variable below the storage region, otherwise it will cause storage layout corruption
     * @see https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable#modifying-your-contracts
     */
    // storage layout region start
    bool public isPaused = false;

    address public sideBridge;

    mapping(address => bool) public authorities;
    mapping(bytes32 => uint8) public changeAuthoritySignedCount;
    mapping(bytes32 => mapping (address => bool)) public changeAuthoritySignedHistory;
    uint256 changeAuthorityCount;

    mapping(bytes32 => SideTokenInfo) public sideTokens;

    mapping(address => uint256) public stakes;
    mapping(bytes32 => DepositInfo) public deposits;
    mapping(bytes32 => WithdrawInfo) public withdraws;

    uint256 depositCount;
    uint256 requiredSignatures;
    // v1 storage region end

    address[] private authorityList;
    bool private authorityChanging = false;
    // v2 storage layout region end

    event Deposited(bytes32 indexed sideTokenId, bytes32 indexed depositId, uint256 depositCount, address beneficiary, uint256 amountMT, uint256 amountST);
    event DepositConfirmed(bytes32 sideTokenId, bytes32 depositId, address beneficiary, uint256 amountMT, uint256 amountST);

    event Staked(address owner, uint256 amount);
    event Unstaked(address owner, uint256 amount);

    event SideBridgeRegistered(address sideBridge, address[] authorities);
    event SideTokenRegistered(bytes32 sideTokenId, uint256 sideChainId, string name, string symbol, uint256 conversionRate, uint8 conversionRateDecimals, uint8 decimals);

    event MainTokenWithdrawSigned(bytes32 indexed redeemId, address signer, address beneficiary, uint256 amountMT, uint8 count);
    event MainTokenWithdrawed(bytes32 indexed redeemId, bytes32 sideTokenId, address beneficiary, uint256 amountMT, uint256 amountST);

    event AuthorityChanged(address oldAuthority, address newAuthority, bytes32 changeId, uint8 changeAuthorityCount);
    event ChangeAuthorityRequest(bytes32 changeId, address oldAuthority, address newAuthority, uint256 changeCount);

    event MainBridgePaused(address from);
    event MainBridgeResumed(address from);

    struct SideTokenInfo {
        uint256 sideChainId;
        string name;
        string symbol;
        uint256 conversionRate;
        uint8 conversionRateDecimals;
        uint8 decimals;
    }

    struct DepositInfo {
        bytes32 sideTokenId;
        address sender;
        uint256 amountMT;
        uint256 amountST;
        uint8 confirmedCount;
        bool confirmed;

        mapping(address => bool) authoritySigned;
    }

    struct WithdrawInfo {
        bytes32 transactionHash;
        bytes32 sideTokenId;
        address beneficiary;
        uint256 amountMT;
        uint256 amountST;
        uint8 signedCount;
        bool withdrawed;

        mapping(address => bool) authoritySigned;
    }

    function initialize(
        uint256 chainId,
        EIP20Standard token,
        address mainAdmin
    ) public initializer {
        __Ownable_init(msg.sender);
        __EnhancedMainBridge_init(chainId, token, mainAdmin);
    }

    function initializeV2(address[] memory _authorityList) reinitializer(2) public {
        for (uint i = 0; i < _authorityList.length; i++) {
            require(authorities[_authorityList[i]] == true);
            authorityList.push(_authorityList[i]);
        }
    }

    modifier onlyAuthority() {
        require(authorities[msg.sender]);
        _;
    }

    modifier onlyMainAdmin() {
        require(msg.sender == mainAdmin());
        _;
    }

    modifier onlyWhenAlive() {
        require(!isPaused);
        _;
    }

    function isOwner() public view returns (bool) {
        return msg.sender == owner();
    }

    function isMainAdmin() public view returns (bool) {
        return msg.sender == mainAdmin();
    }

    function pauseBridge() external {
        require(isOwner() || isMainAdmin());
        _pauseBridge();
    }

    function _pauseBridge() internal {
        require(!isPaused);
        isPaused = true;

        emit MainBridgePaused(msg.sender);
    }

    function resumeBridge() external {
        require(isOwner() || isMainAdmin());
        _resumeBridge();
    }

    function _resumeBridge() internal {
        require(isPaused);
        isPaused = false;

        emit MainBridgeResumed(msg.sender);
    }

    function changeAuthorityRequest(address _oldAuthority, address _newAuthority) external onlyOwner {
        require(_oldAuthority != address(0));
        require(_newAuthority != address(0));
        require(authorities[_oldAuthority]); // _oldAuthority가 현재 authority여야함
        require(!authorities[_newAuthority]); // _newAuthority가 현재 authority가 아니어야함
        require(sideBridge != address(0), "side bridge not registered");
        require(!authorityChanging, "authority changing");

        bytes32 changeId = keccak256(abi.encodePacked(_oldAuthority, _newAuthority, changeAuthorityCount));

        changeAuthoritySignedCount[changeId] = 0;
        changeAuthorityCount++;
        authorityChanging = true;

        emit ChangeAuthorityRequest(changeId, _oldAuthority, _newAuthority, changeAuthorityCount);
    }

    function changeAuthority(
        bytes32 _changeId,
        address _oldAuthority,
        address _newAuthority
    ) external onlyAuthority {
        require(_oldAuthority != address(0));
        require(_newAuthority != address(0));
        require(!changeAuthoritySignedHistory[_changeId][msg.sender]); // allow once for one authority
        require(_changeId ==
            keccak256(abi.encodePacked(_oldAuthority, _newAuthority, changeAuthorityCount - 1)), "invalid changeId");

        changeAuthoritySignedHistory[_changeId][msg.sender] = true;
        changeAuthoritySignedCount[_changeId]++;
        int authoritySignedCount = 0;
        for (uint i = 0; i < authorityList.length; i++) {
            if (changeAuthoritySignedHistory[_changeId][authorityList[i]]) {
                authoritySignedCount++;
            }
        }

        if (authorities[_newAuthority] == false
            && authoritySignedCount >= requiredSignatures
        ) {
            authorities[_oldAuthority] = false;
            authorities[_newAuthority] = true;
            _updateAuthority(_oldAuthority, _newAuthority);
            authorityChanging = false;

            for (uint i = 0; i < authorityList.length; i++) {
                changeAuthoritySignedHistory[_changeId][authorityList[i]] = false;
            }

            emit AuthorityChanged(_oldAuthority, _newAuthority, _changeId, changeAuthoritySignedCount[_changeId]);
        }
    }

    function _updateAuthority(address _oldAuthority, address _newAuthority) internal {
        for (uint i = 0; i < authorityList.length; i++) {
            if (authorityList[i] == _oldAuthority) {
                authorityList[i] = _newAuthority;
                break;
            }
        }
    }

    function registerSideBridge(
        address _sideBridge,
        uint256 _requiredSignatures,
        address[] memory _authorities) external onlyWhenAlive onlyOwner {
        require(_sideBridge != address(0)); // check if _sideBridge is valid
        require(sideBridge == address(0)); // make sure SideBridge is not yet registered
        require(_authorities.length < 256); // check if authorities number is less than 2^8 = 256
        require(_requiredSignatures <= _authorities.length);
        require(_requiredSignatures > (_authorities.length / 2));

        requiredSignatures = _requiredSignatures;
        sideBridge = _sideBridge;

        for (uint8 i = 0; i < _authorities.length; i++) {
            authorities[_authorities[i]] = true;
            authorityList.push(_authorities[i]);
        }

        emit SideBridgeRegistered(_sideBridge, _authorities);
    }

    function registerSideToken(
        uint256 _sideChainId,
        string memory _name,
        string memory _symbol,
        uint256 _conversionRate,
        uint8 _conversionRateDecimals,
        bytes32 _sideTokenId
    ) external onlyWhenAlive onlyOwner returns (bytes32 sideTokenId)
    {
        require(bytes(_name).length > 0);
        require(bytes(_symbol).length > 0);
        require(bytes(_symbol).length < 8);

        sideTokenId = hashSideTokenId(_sideChainId, _name, _symbol, _conversionRate, _conversionRateDecimals);

        require(sideTokenId == _sideTokenId);

        sideTokens[sideTokenId] = SideTokenInfo(_sideChainId, _name, _symbol, _conversionRate, _conversionRateDecimals, TOKEN_DECIMALS);

        emit SideTokenRegistered(sideTokenId, _sideChainId, _name, _symbol, _conversionRate, _conversionRateDecimals, TOKEN_DECIMALS);
    }

    function ownerDeposit(address _beneficiary, bytes32 _sideTokenId, uint _amount) external
    onlyOwner
    onlyWhenAlive {
        internalDeposit(_beneficiary, _sideTokenId, _amount);
    }

    function deposit(bytes32 _sideTokenId, uint _amount) external onlyWhenAlive {
        internalDeposit(msg.sender, _sideTokenId, _amount);
    }

    function internalDeposit(address _beneficiary, bytes32 _sideTokenId, uint _amount) internal onlyWhenAlive {
        require(_sideTokenId != 0);
        require(sideTokens[_sideTokenId].sideChainId != 0);
        require(_amount > 0);

        mainToken().transferFrom(_beneficiary, address(this), _amount);

        uint256 conversionRate = sideTokens[_sideTokenId].conversionRate;
        uint256 conversionRateDecimals = sideTokens[_sideTokenId].conversionRateDecimals;
        uint256 amountST = _amount * conversionRate / (10**uint256(conversionRateDecimals));

        depositCount++;

        bytes32 depositId = keccak256(abi.encodePacked(depositCount, _sideTokenId, _beneficiary, _amount, amountST));

        DepositInfo storage depositInfo = deposits[depositId];

        depositInfo.sideTokenId = _sideTokenId;
        depositInfo.amountMT = _amount;
        depositInfo.amountST = amountST;
        depositInfo.sender = _beneficiary;
        depositInfo.confirmed = false;
        depositInfo.confirmedCount = 0;

        emit Deposited(_sideTokenId, depositId, depositCount, _beneficiary, _amount, amountST);
    }

    function withdraw(
        bytes32 _redeemId,
        bytes32 _sideTokenId,
        address _beneficiary,
        uint256 _amountST,
        bytes32 txHash
    ) onlyAuthority() external {
        require(_beneficiary != address(0));
        require(_redeemId ==
            keccak256(abi.encodePacked(_sideTokenId, _beneficiary, _amountST, txHash)), "invalid redeemId");

        WithdrawInfo storage withdrawInfo = withdraws[_redeemId];

        if (withdrawInfo.withdrawed)
            return;

        if (withdrawInfo.signedCount == 0) {
            SideTokenInfo storage sideToken = sideTokens[_sideTokenId];

            uint256 conversionRate = sideToken.conversionRate;
            uint256 conversionRateDecimals = sideToken.conversionRateDecimals;

            uint256 amountMT = _amountST / conversionRate * (10 ** conversionRateDecimals);

            withdrawInfo.transactionHash = txHash;
            withdrawInfo.sideTokenId = _sideTokenId;
            withdrawInfo.beneficiary = _beneficiary;
            withdrawInfo.amountMT = amountMT;
            withdrawInfo.amountST = _amountST;
            withdrawInfo.withdrawed = false;
        }

        require(withdrawInfo.beneficiary == _beneficiary);

        if (withdrawInfo.authoritySigned[msg.sender] == false) {
            withdrawInfo.authoritySigned[msg.sender] = true;
            withdrawInfo.signedCount++;

            emit MainTokenWithdrawSigned(_redeemId, msg.sender, _beneficiary, withdrawInfo.amountMT, withdrawInfo.signedCount);
        }

        if (withdrawInfo.signedCount >= requiredSignatures) {
            mainToken().transfer(_beneficiary, withdrawInfo.amountMT);

            withdrawInfo.withdrawed = true;
            emit MainTokenWithdrawed(_redeemId, _sideTokenId, _beneficiary, withdrawInfo.amountMT, _amountST);
        }
    }

    function confirmDeposit(bytes32 depositId) external onlyAuthority() {
        DepositInfo storage depositInfo = deposits[depositId];

        if (depositInfo.authoritySigned[msg.sender]) {
            return;
        }
        require(depositInfo.amountST != 0);

        depositInfo.authoritySigned[msg.sender] = true;
        depositInfo.confirmedCount++;

        if (depositInfo.confirmed == false && depositInfo.confirmedCount >= requiredSignatures) {
            depositInfo.confirmed = true;

            emit DepositConfirmed(depositInfo.sideTokenId, depositId, depositInfo.sender, depositInfo.amountMT, depositInfo.amountST);
        }
    }

    function stake(uint256 _amount) external onlyWhenAlive {
        require(_amount > 0);

        mainToken().transferFrom(msg.sender, address(this), _amount);

        stakes[msg.sender] = stakes[msg.sender] + _amount;

        emit Staked(msg.sender, _amount);
    }

    function unstake(uint256 _amount) external onlyWhenAlive {
        require(_amount > 0);
        require(stakes[msg.sender] >= _amount);

        stakes[msg.sender] = stakes[msg.sender] - _amount;

        mainToken().transfer(msg.sender, _amount);

        emit Unstaked(msg.sender, _amount);
    }

    function stakedAmount(address _staker) external view returns (uint256) {
        return stakes[_staker];
    }

    function hashSideTokenId(uint256 _sideChainId, string memory _name, string memory _symbol, uint256 _conversionRate, uint8 _conversionRateDecimals) public view returns (bytes32 sideTokenId) {
        return HashUtils.hashSideTokenId(address(this), sideBridge, _sideChainId, _name, _symbol, _conversionRate, _conversionRateDecimals);
    }

    function receiveApproval(address _from, uint256 _value, address _token, bytes memory _extraData)
    external onlyWhenAlive() {
        internalDeposit(_from, bytesToBytes32(_extraData, 0), _value);
    }

    function bytesToBytes32(bytes memory b, uint offset) private pure returns (bytes32) {
        bytes32 out;

        for (uint i = 0; i < 32; i++) {
            out |= bytes32(b[offset + i] & 0xFF) >> (i * 8);
        }
        return out;
    }

    function getAuthorities() public view onlyOwner returns  (address[] memory) {
        return authorityList;
    }

    function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {

    }
}
