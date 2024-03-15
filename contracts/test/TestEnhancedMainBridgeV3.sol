// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import {TestEnhancedMainBridgeV2} from "./TestEnhancedMainBridgeV2.sol";

contract TestEnhancedMainBridgeV3 is TestEnhancedMainBridgeV2 {
    function initializeV3() reinitializer(3) public {
    }
}
