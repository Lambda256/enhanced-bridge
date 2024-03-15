// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./Initializeable.sol";
import {EIP20Standard} from "../EIP20Standard.sol";

contract EnhancedMainBridgeUpgradeable is Initializable  {
    error ChainIdInitializeError(uint256 chainId);
    error MainTokenInitializeError(address mainToken);
    error MainAdminInitializeError(address mainAdmin);

    struct EnhancedMainBridgeStorage {
        uint256 _chainId;
        EIP20Standard _mainToken;
        address _mainAdmin;
    }

    // keccak256(abi.encode(uint256(keccak256("enhanced.mainbridge")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant EnhancedMainBridgeStorageLocation = 0x313f51f42abd24febab3df997d649545d09b9b9195891ba256903926e17f2e00;

    function _getEnhancedMainBridgeStorage() private pure returns (EnhancedMainBridgeStorage storage $) {
        assembly {
            $.slot := EnhancedMainBridgeStorageLocation
        }
    }


    function __EnhancedMainBridge_init(
        uint256 _chainId,
        EIP20Standard _token,
        address _mainAdmin
    ) internal onlyInitializing {
        __EnhancedMainBridge_init_unchained(_chainId, _token, _mainAdmin);
    }

    function __EnhancedMainBridge_init_unchained(
        uint256 _chainId,
        EIP20Standard _token,
        address _mainAdmin
    ) internal onlyInitializing {
        if (_chainId == 0) revert ChainIdInitializeError(_chainId);
        if (address(_token) == address(0)) revert MainTokenInitializeError(address(_token));
        if (_mainAdmin == address(0)) revert MainAdminInitializeError(_mainAdmin);

        EnhancedMainBridgeStorage storage $ = _getEnhancedMainBridgeStorage();
        $._chainId = _chainId;
        $._mainToken = _token;
        $._mainAdmin = _mainAdmin;
    }

    function chainId() public view returns (uint256) {
        EnhancedMainBridgeStorage storage $ = _getEnhancedMainBridgeStorage();
        return $._chainId;
    }

    function mainToken() public view returns (EIP20Standard) {
        EnhancedMainBridgeStorage storage $ = _getEnhancedMainBridgeStorage();
        return $._mainToken;
    }

    function mainAdmin() public view returns (address) {
        EnhancedMainBridgeStorage storage $ = _getEnhancedMainBridgeStorage();
        return $._mainAdmin;
    }
}
