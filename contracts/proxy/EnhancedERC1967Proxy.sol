// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (proxy/ERC1967/ERC1967Proxy.sol)

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract EnhancedERC1967Proxy is ERC1967Proxy {
    constructor(
        address implementation,
        bytes memory _data
    ) payable ERC1967Proxy(implementation, _data)
    {
    }
}
