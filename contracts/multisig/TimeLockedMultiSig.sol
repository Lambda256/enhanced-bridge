// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import "./ITimeLockedMultiSig.sol";

contract TimeLockedMultiSig is ITimeLockedMultisig, AccessControl {
    bytes32 public constant TIMELOCK_ADMIN_ROLE = keccak256("TIMELOCK_ADMIN_ROLE");
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant APPROVER_ROLE = keccak256("APPROVER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant CANCELLER_ROLE = keccak256("CANCELLER_ROLE");
    uint256 internal constant _DONE_TIMESTAMP = uint256(1);

    address[] private _approvers;

    struct Operation {
        uint256 timestamps;
        mapping(address => bool) isApproved;
    }

    mapping (bytes32 => Operation) private _operations;
    uint256 private _minDelay;
    uint256 private _threshold;

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
        _setRoleAdmin(APPROVER_ROLE, TIMELOCK_ADMIN_ROLE);
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
            require(approvers[i] != address(0), "TimeLockedMultiSig: approver should not be the zero address");
            _grantRole(APPROVER_ROLE, approvers[i]);
        }

        _threshold = threshold;
        _approvers = approvers;

        emit MinApprovalThresholdChange(0, threshold);
    }

    /**
     * @dev Modifier to make a function callable only by a certain role. In
     * addition to checking the sender's role, `address(0)` 's role is also
     * considered. Granting a role to `address(0)` is equivalent to enabling
     * this role for everyone.
     */
    modifier onlyRoleOrOpenRole(bytes32 role) {
        if (!hasRole(role, address(0))) {
            _checkRole(role, _msgSender());
        }
        _;
    }

    function grantRole(bytes32 role, address account) public virtual override onlyRole(getRoleAdmin(role)) {
        require(role != APPROVER_ROLE, "TimeLockedMultiSig: use addApprover to add approver");
        super.grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public virtual override onlyRole(getRoleAdmin(role)) {
        require(role != APPROVER_ROLE, "TimeLockedMultiSig: use removeApprover to remove approver");
        super.revokeRole(role, account);
    }

    /**
     * @dev Renouncing is not allowed.
     */
    function renounceRole(bytes32 role, address account) public virtual override {
    }

    function addApprover(
        address approver,
        uint256 threshold
    ) public virtual override onlyRole(getRoleAdmin(APPROVER_ROLE)) {
        require(approver != address(0), "TimeLockedMultiSig: approver should not be the zero address");
        require(!hasRole(APPROVER_ROLE, approver), "TimeLockedMultiSig: approver should not have APPROVER_ROLE");
        require(threshold <= _approvers.length + 1, "TimeLockedMultiSig: threshold should be less than or equal to approvers.length + 1");
        require(threshold > (_approvers.length + 1) / 2, "TimeLockedMultiSig: threshold should be greater than (approvers.length + 1) / 2");

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
    ) public virtual override onlyRole(getRoleAdmin(APPROVER_ROLE)) {
        require(approver != address(0), "TimeLockedMultiSig: approver should not be the zero address");
        require(hasRole(APPROVER_ROLE, approver), "TimeLockedMultiSig: approver should have APPROVER_ROLE");
        require(_approvers.length > 1, "TimeLockedMultiSig: approvers.length should be greater than 1");
        require(threshold <= _approvers.length - 1, "TimeLockedMultiSig: threshold should be less than or equal to approvers.length - 1");
        require(threshold > (_approvers.length - 1) / 2, "TimeLockedMultiSig: threshold should be greater than (approvers.length - 1) / 2");

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
    ) public virtual override onlyRole(getRoleAdmin(APPROVER_ROLE)) {
        require(oldApprover != address(0), "TimeLockedMultiSig: old approver should not be the zero address");
        require(newApprover != address(0), "TimeLockedMultiSig: new approver should not be the zero address");
        require(hasRole(APPROVER_ROLE, oldApprover), "TimeLockedMultiSig: old approver should have APPROVER_ROLE");
        require(!hasRole(APPROVER_ROLE, newApprover), "TimeLockedMultiSig: new approver should not have APPROVER_ROLE");
        require(threshold <= _approvers.length, "TimeLockedMultiSig: threshold should be less than or equal to approvers.length");
        require(threshold > _approvers.length / 2, "TimeLockedMultiSig: threshold should be greater than approvers.length / 2");

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

    function isOperation(bytes32 id) public view virtual override returns (bool) {
        return getOperationState(id) != OperationState.Unset;
    }

    function isOperationPending(bytes32 id) public view virtual override returns (bool) {
        OperationState state = getOperationState(id);
        return state == OperationState.Waiting || state == OperationState.Ready;
    }

    function isOperationReady(bytes32 id) public view virtual override returns (bool) {
        return getOperationState(id) == OperationState.Ready;

    }

    function isOperationDone(bytes32 id) public view virtual override returns (bool) {
        return getOperationState(id) == OperationState.Done;
    }

    function getTimestamp(bytes32 id) public view virtual override returns (uint256) {
        return _operations[id].timestamps;
    }

    function getOperationState(bytes32 id) public view virtual override returns (OperationState) {
        uint256 timestamp = getTimestamp(id);
        if (timestamp == 0) {
            return OperationState.Unset;
        } else if (timestamp == _DONE_TIMESTAMP) {
            return OperationState.Done;
        } else if (timestamp > block.timestamp && getApprovalCount(id) >= getThreshold()) {
            return OperationState.Waiting;
        } else {
            return OperationState.Ready;
        }
    }

    function getOperation(bytes32 id) public view virtual override returns (uint256 timestamp, uint256 approvalCount) {
        return (_operations[id].timestamps, getApprovalCount(id));
    }

    function getMinDelay() public view virtual override returns (uint256) {
        return _minDelay;
    }

    function getThreshold() public view virtual override returns (uint256) {
        return _threshold;
    }

    function getApprovers() public view virtual override returns (address[] memory) {
        return _approvers;
    }

    function getApprovalCount(bytes32 id) public view virtual override returns (uint256) {
        Operation storage operation = _operations[id];
        uint256 approvalCount = 0;
        for (uint256 i = 0; i < _approvers.length; i++) {
            if (operation.isApproved[_approvers[i]]) {
                approvalCount++;
            }
        }
        return approvalCount;
    }

    function hashOperation(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) public pure virtual override returns (bytes32) {
        return keccak256(abi.encode(target, value, data, predecessor, salt));
    }

    function schedule(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) public virtual override onlyRole(PROPOSER_ROLE) {
        bytes32 id = hashOperation(target, value, data, predecessor, salt);
        _schedule(id, delay);
        emit CallScheduled(id, target, value, data, predecessor, delay);
        if (salt != bytes32(0)) {
            emit CallSalt(id, salt);
        }
    }

    /**
     * @dev Schedule an operation that is to become valid after a given delay.
     */
    function _schedule(bytes32 id, uint256 delay) private {
        require(!isOperation(id), "TimelockController: operation already scheduled");
        require(delay >= getMinDelay(), "TimelockController: insufficient delay");
        uint256 minExecutionTimestamp = block.timestamp + delay;

        Operation storage operation = _operations[id];
        operation.timestamps = minExecutionTimestamp;
    }

    function cancel(bytes32 id) public virtual override onlyRole(CANCELLER_ROLE) {
        require(isOperationPending(id), "TimelockController: operation cannot be cancelled");
        delete _operations[id];

        emit Cancelled(id);
    }

    function approve(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) public virtual override onlyRole(APPROVER_ROLE) {
        bytes32 id = hashOperation(target, value, data, predecessor, salt);
        _approve(id);
        emit CallApproved(id);
    }

    function _approve(bytes32 id) private {
        require(isOperationPending(id), "TimelockController: operation cannot be approved");

        Operation storage operation = _operations[id];
        require(!operation.isApproved[msg.sender], "TimelockController: operation already approved");
        operation.isApproved[msg.sender] = true;
    }

    function execute(
        address target,
        uint256 value,
        bytes calldata payload,
        bytes32 predecessor,
        bytes32 salt
    ) public payable virtual override onlyRoleOrOpenRole(EXECUTOR_ROLE) {
        bytes32 id = hashOperation(target, value, payload, predecessor, salt);

        _beforeCall(id, predecessor);
        _execute(target, value, payload);
        emit CallExecuted(id, target, value, payload);
        _afterCall(id);
    }

    /**
     * @dev Execute an operation's call.
     */
    function _execute(address target, uint256 value, bytes calldata data) internal virtual {
        (bool success, bytes memory returndata) = target.call{value: value}(data);
        Address.verifyCallResult(success, returndata, "TimelockController: execution failed");
    }

    /**
     * @dev Checks before execution of an operation's calls.
     */
    function _beforeCall(bytes32 id, bytes32 predecessor) private view {
        require(isOperationReady(id), "TimelockController: operation is not ready");
        require(predecessor == bytes32(0) || isOperationDone(predecessor), "TimelockController: missing dependency");
    }

    /**
     * @dev Checks after execution of an operation's calls.
     */
    function _afterCall(bytes32 id) private {
        require(isOperationReady(id), "TimelockController: operation is not ready");
        Operation storage operation = _operations[id];
        operation.timestamps = _DONE_TIMESTAMP;
    }

    function isApproved(
        address target,
        uint256 value,
        bytes calldata payload,
        bytes32 predecessor,
        bytes32 salt,
        address approver
    ) public view virtual override returns (bool) {
        bytes32 id = hashOperation(target, value, payload, predecessor, salt);
        return _operations[id].isApproved[approver];
    }

    function updateDelay(uint256 newDelay) external virtual override {
        require(msg.sender == address(this), "TimelockController: caller must be timelock");
        emit MinDelayChange(_minDelay, newDelay);
        _minDelay = newDelay;
    }
}
