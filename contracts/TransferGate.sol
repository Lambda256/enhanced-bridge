// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./EIP20Standard.sol";

contract TransferGate is Ownable {
    address public immutable erc20;
    address public immutable mainBridgeProxy;

    constructor(
        address _erc20,
        address _mainBridgeProxy
    ) {
        erc20 = _erc20;
        mainBridgeProxy = _mainBridgeProxy;
    }

    function transferGate() public onlyOwner {
        uint256 balance = EIP20Standard(erc20).balanceOf(address(this));
        EIP20Standard(erc20).transfer(mainBridgeProxy, balance);
    }

    function getMainBridgeProxy() public view returns (address) {
        return mainBridgeProxy;
    }

    function getToken() public view returns (address) {
        return erc20;
    }
}
