// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

interface ITimeLockedMultisig {
    enum OperationState {
        Unset,
        Waiting,
        Ready,
        Done
    }

    /**
     * @dev Emitted when a call is scheduled as part of operation `id`.
     */
    event CallScheduled(
        bytes32 indexed id,
        address target,
        uint256 value,
        bytes data,
        bytes32 predecessor,
        uint256 delay
    );

    /**
     * @dev Emitted when a call is approved as part of operation `id`.
     */
    event CallApproved(bytes32 indexed id);

    /**
     * @dev Emitted when a call is performed as part of operation `id`.
     */
    event CallExecuted(bytes32 indexed id, address target, uint256 value, bytes data);

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

    /**
      * @dev Emitted when the minimum approval threshold is modified.
      */
    event MinApprovalThresholdChange(uint256 oldThreshold, uint256 newThreshold);

    /**
      * @dev Emitted when an approver is added to the multisig.
      */
    event ApproverAdded(address indexed approver);

    /**
      * @dev Emitted when an approver is removed from the multisig.
      */
    event ApproverRemoved(address indexed approver);

    /**
      * @dev Emitted when an approver is updated in the multisig.
      */
    event ApproverUpdated(address oldApprover, address indexed newApprover);

    /**
      * @dev Adds an approver to the multisig.
      */
    function addApprover(address approver, uint256 threshold) external;

    /**
      * @dev remove an approver to the multisig.
      */
    function removeApprover(address approver, uint256 threshold) external;

    /**
      * @dev update an approver to the multisig.
      */
    function updateApprover(address oldApprover, address newApprover, uint256 threshold) external;

    /**
     * @dev Returns whether an id corresponds to a registered operation. This
     * includes both Waiting, Ready, and Done operations.
     */
    function isOperation(bytes32 id) external view returns (bool);

    /**
     * @dev Returns whether an operation is pending or not. Note that a "pending" operation may also be "ready".
     */
    function isOperationPending(bytes32 id) external view returns (bool);

    /**
     * @dev Returns whether an operation is ready for execution. Note that a "ready" operation is also "pending".
     */
    function isOperationReady(bytes32 id) external view returns (bool);

    /**
     * @dev Returns whether an operation is done or not.
     */
    function isOperationDone(bytes32 id) external view returns (bool);

    /**
     * @dev Returns the timestamp at which an operation becomes ready (0 for
     * unset operations, 1 for done operations).
     */
    function getTimestamp(bytes32 id) external view returns (uint256);

    /**
     * @dev Returns operation state.
     */
    function getOperationState(bytes32 id) external view returns (OperationState);

    /**
      * @dev Returns the timestamp, approval count of an operation.
      */
    function getOperation(bytes32 id) external view returns (uint256, uint256);

    /**
     * @dev Returns the minimum approval threshold for an operation to become valid.
     */
    function getThreshold() external view returns (uint256);

    /**
     * @dev Returns the array of approvers.
     */
    function getApprovers() external view returns (address[] memory);

    /**
     * @dev Returns the number of approvals for an operation.
     */
    function getApprovalCount(bytes32 id) external view returns (uint256);

    /**
     * @dev Returns the minimum delay for an operation to become valid.
     *
     * This value can be changed by executing an operation that calls `updateDelay`.
     */
    function getMinDelay() external view returns (uint256);

    /**
     * @dev Returns the identifier of an operation containing a single
     * transaction.
     */
    function hashOperation(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external pure returns (bytes32);

    /**
     * @dev Schedule an operation containing a single transaction.
     *
     * Emits {CallSalt} if salt is nonzero, and {CallScheduled}.
     *
     * Requirements:
     *
     * - the caller must have the 'proposer' role.
     */
    function schedule(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt, uint256 delay) external;

    /**
     * @dev Cancel an operation.
     *
     * Requirements:
     *
     * - the caller must have the 'canceller' role.
     */
    function cancel(bytes32 id) external;

    /**
     * @dev Approve an operation.
     *
     * Emits a {CallApproved} event.
     *
     * Requirements:
     *
     * - the caller must have the 'approver' role.
     */
    function approve(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) external;

    /**
     * @dev Execute an (ready) operation containing a single transaction.
     *
     * Emits a {CallExecuted} event.
     *
     * Requirements:
     *
     * - the caller must have the 'executor' role.
     */
    // This function can reenter, but it doesn't pose a risk because _afterCall checks that the proposal is pending,
    // thus any modifications to the operation during reentrancy should be caught.
    // slither-disable-next-line reentrancy-eth
    function execute(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) payable external;

    /**
     * @dev Returns whether an operation has been approved by a given approver.
     */
    function isApproved(bytes32 id, address approver) external view returns (bool);

    /**
     * @dev Changes the minimum timelock duration for future operations.
     *
     * Emits a {MinDelayChange} event.
     *
     * Requirements:
     *
     * - the caller must be the timelock itself. This can only be achieved by scheduling and later executing
     * an operation where the timelock is the target and the data is the ABI-encoded call to this function.
     */
    function updateDelay(uint256 newDelay) external;
}
