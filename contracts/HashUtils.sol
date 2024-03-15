// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

library HashUtils {

    function hashSideTokenId(address mainBridge,
        address sideBridge, uint256 _sideChainId,
        string memory _name, string memory _symbol,
        uint256 _conversionRate,
        uint8 _convesionRateDecimals
    ) internal pure returns (bytes32 sideTokenId) {
        return keccak256(abi.encodePacked(mainBridge, sideBridge, _name, _symbol, _conversionRate, _convesionRateDecimals, _sideChainId));
    }

}
