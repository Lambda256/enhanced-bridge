// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract TimeLockedMultiSig is AccessControl {
    bytes32 public constant TIMELOCK_ADMIN_ROLE = keccak256("TIMELOCK_ADMIN_ROLE");
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant APPROVER_ROLE = keccak256("APPROVER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant CANCELLER_ROLE = keccak256("CANCELLER_ROLE");
    uint256 internal constant _DONE_TIMESTAMP = uint256(1);

    address[] private _approvers;

    mapping(bytes32 => uint256) private _timestamps;
    uint256 private _minDelay;
    uint256 private _threshold;

    /**
     * @dev Emitted when a call is performed as part of operation `id`.
     */
    event CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data);

    /**
     * @dev Emitted when new proposal is scheduled with non-zero salt.
     */
    event CallSalt(bytes32 indexed id, bytes32 salt);

    /**
     * @dev Emitted when operation `id` is cancelled.
     */
    event Cancelled(bytes32 indexed id);

    /**
     * @dev Emitted when the minimum delay for future operations is modified.
     */
    event MinDelayChange(uint256 oldDuration, uint256 newDuration);

    event MinApprovalThresholdChange(uint256 oldThreshold, uint256 newThreshold);
    event ApproverAdded(address indexed approver);
    event ApproverRemoved(address indexed approver);
    event ApproverUpdated(address oldApprover, address indexed newApprover);

    /**
     * @dev Initializes the contract with the following parameters:
     *
     * - `minDelay`: initial minimum delay for operations
     * - `proposers`: accounts to be granted proposer and canceller roles
     * - `executors`: accounts to be granted executor role
     * - `admin`: optional account to be granted admin role; disable with zero address
     *
     * IMPORTANT: The optional admin can aid with initial configuration of roles after deployment
     * without being subject to delay, but this role should be subsequently renounced in favor of
     * administration through timelocked proposals. Previous versions of this contract would assign
     * this admin to the deployer automatically and should be renounced as well.
     */
    constructor(
        address[] memory approvers,
        uint256 threshold,
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) {
        _setRoleAdmin(TIMELOCK_ADMIN_ROLE, TIMELOCK_ADMIN_ROLE);
        _setRoleAdmin(PROPOSER_ROLE, TIMELOCK_ADMIN_ROLE);
        _setRoleAdmin(EXECUTOR_ROLE, TIMELOCK_ADMIN_ROLE);
        _setRoleAdmin(CANCELLER_ROLE, TIMELOCK_ADMIN_ROLE);

        // self administration
        _setupRole(TIMELOCK_ADMIN_ROLE, address(this));

        // optional admin
        if (admin != address(0)) {
            _grantRole(TIMELOCK_ADMIN_ROLE, admin);
        }

        // register proposers and cancellers
        for (uint256 i = 0; i < proposers.length; ++i) {
            _grantRole(PROPOSER_ROLE, proposers[i]);
            _grantRole(CANCELLER_ROLE, proposers[i]);
        }

        // register executors
        for (uint256 i = 0; i < executors.length; ++i) {
            _grantRole(EXECUTOR_ROLE, executors[i]);
        }

        _minDelay = minDelay;
        emit MinDelayChange(0, minDelay);

        require(threshold <= approvers.length);
        require(threshold > (approvers.length / 2));

        for (uint i = 0; i < approvers.length; i++) {
            require(approvers[i] != address(0), "TimeLockedMultiSig.constructor: approver should not be the zero address");
            _grantRole(APPROVER_ROLE, approvers[i]);
        }

        _threshold = threshold;
        _approvers = approvers;

        emit MinApprovalThresholdChange(0, threshold);
    }

    function grantRole(bytes32 role, address account) public virtual override onlyRole(getRoleAdmin(role)) {
        require(role != APPROVER_ROLE, "TimeLockedMultiSig.grantRole: use addApprover to add approver");
        super.grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public virtual override onlyRole(getRoleAdmin(role)) {
        require(role != APPROVER_ROLE, "TimeLockedMultiSig.revokeRole: use removeApprover to remove approver");
        super.revokeRole(role, account);
    }

    function renounceRole(bytes32 role, address account) public virtual override {
        require(role != APPROVER_ROLE, "TimeLockedMultiSig.renounceRole: use removeApprover to remove approver");
        super.renounceRole(role, account);
    }

    function addApprover(
        address approver,
        uint256 threshold
    ) public virtual onlyRole(getRoleAdmin(APPROVER_ROLE)) {
        require(approver != address(0), "TimeLockedMultiSig.addApprover: approver should not be the zero address");
        require(!hasRole(APPROVER_ROLE, approver), "TimeLockedMultiSig.addApprover: approver should not have APPROVER_ROLE");
        require(_threshold <= _approvers.length + 1, "TimeLockedMultiSig.addApprover: threshold should be less than or equal to approvers.length + 1");
        require(_threshold > (_approvers.length + 1) / 2, "TimeLockedMultiSig.addApprover: threshold should be greater than (approvers.length + 1) / 2");

        uint256 oldThreshold = _threshold;
        _threshold = threshold;
        _approvers.push(approver);
        _grantRole(APPROVER_ROLE, approver);

        emit MinApprovalThresholdChange(oldThreshold, threshold);
        emit ApproverAdded(approver);
    }

    function removeApprover(
        address approver,
        uint256 threshold
    ) public virtual onlyRole(getRoleAdmin(APPROVER_ROLE)) {
        require(approver != address(0), "TimeLockedMultiSig.removeApprover: approver should not be the zero address");
        require(hasRole(APPROVER_ROLE, approver), "TimeLockedMultiSig.removeApprover: approver should have APPROVER_ROLE");
        require(_approvers.length > 1, "TimeLockedMultiSig.removeApprover: approvers.length should be greater than 1");
        require(threshold <= _approvers.length - 1, "TimeLockedMultiSig.removeApprover: threshold should be less than or equal to approvers.length - 1");
        require(threshold > (_approvers.length - 1) / 2, "TimeLockedMultiSig.removeApprover: threshold should be greater than (approvers.length - 1) / 2");

        uint256 oldThreshold = _threshold;
        for (uint i = 0; i < _approvers.length; i++) {
            if (_approvers[i] == approver) {
                _approvers[i] = _approvers[_approvers.length - 1];
                _approvers.pop();
                break;
            }
        }
        _revokeRole(APPROVER_ROLE, approver);
        _threshold = threshold;

        emit MinApprovalThresholdChange(oldThreshold, threshold);
        emit ApproverRemoved(approver);
    }

    function updateApprover(
        address oldApprover,
        address newApprover,
        uint256 threshold
    ) public virtual onlyRole(getRoleAdmin(APPROVER_ROLE)) {
        require(oldApprover != address(0), "TimeLockedMultiSig.updateApprover: old approver should not be the zero address");
        require(newApprover != address(0), "TimeLockedMultiSig.updateApprover: new approver should not be the zero address");
        require(hasRole(APPROVER_ROLE, oldApprover), "TimeLockedMultiSig.updateApprover: old approver should have APPROVER_ROLE");
        require(!hasRole(APPROVER_ROLE, newApprover), "TimeLockedMultiSig.updateApprover: new approver should not have APPROVER_ROLE");
        require(threshold <= _approvers.length, "TimeLockedMultiSig.updateApprover: threshold should be less than or equal to approvers.length");
        require(threshold > _approvers.length / 2, "TimeLockedMultiSig.updateApprover: threshold should be greater than approvers.length / 2");

        uint256 oldThreshold = _threshold;
        for (uint i = 0; i < _approvers.length; i++) {
            if (_approvers[i] == oldApprover) {
                _approvers[i] = newApprover;
                break;
            }
        }
        _revokeRole(APPROVER_ROLE, oldApprover);
        _grantRole(APPROVER_ROLE, newApprover);
        _threshold = threshold;

        emit MinApprovalThresholdChange(oldThreshold, threshold);
        emit ApproverUpdated(oldApprover, newApprover);
    }
}
