// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

interface TokenRecipient {
    function receiveApproval(
        address _from,
        uint256 _value,
        address _token,
        bytes memory _extraData
    ) external;
}
