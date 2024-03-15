// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import {EnhancedMainBridge} from "../EnhancedMainBridge.sol";

contract TestEnhancedMainBridgeV2 is EnhancedMainBridge {
    function initializeV2() reinitializer(2) public {
    }

    function disableInitializers() public {
        _disableInitializers();
    }
}
