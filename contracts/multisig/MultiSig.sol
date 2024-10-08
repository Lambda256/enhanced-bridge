// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

contract MultiSig {
    event ChangeValidatorRequest(
        bytes32 indexed updateId,
        uint256 changeValidatorCount
    );
    event ChangeValidatorApproved(
        bytes32 indexed updateId,
        uint256 signedCount
    );
    event ExecuteChangeValidator(
        bytes32 indexed updateId
    );

    event SubmitTransaction(
        bytes32 indexed txId,
        uint256 txCount
    );

    event ApproveTransaction(
        bytes32 indexed txId,
        uint256 signedCount
    );

    event ExecuteTransaction(
        bytes32 indexed txId
    );

    error TransactionFail(bytes reason);

    struct Transaction {
        address to;
        uint value;
        bytes data;
        bool executed;

        mapping(address => bool) isConfirmed;
    }

    struct ValidatorTx {
        address oldValidator;
        address newValidator;
        uint256 threshold;
        bool executed;

        mapping(address => bool) isConfirmed;
    }

    mapping(bytes32 => Transaction) public transactions;
    mapping(bytes32 => ValidatorTx) public validatorTxs;

    address[] public validators;
    mapping(address => bool) public isValidator;
    uint256 public requiredSignatureCount;

    uint256 public changeValidatorCount = 0;
    uint256 public txCount = 0;

    constructor(
        address[] memory _validators,
        uint256 _threshold
    ) {
        require(_threshold <= _validators.length);
        require(_threshold > (_validators.length / 2));

        for (uint i = 0; i < _validators.length; i++) {
            require(_validators[i] != address(0), "MultiSig: validator should not be the zero address");
            isValidator[_validators[i]] = true;
        }

        validators = _validators;
        requiredSignatureCount = _threshold;
    }

    modifier onlyValidator() {
        require(isValidator[msg.sender], "MultiSig: caller is not a validator");
        _;
    }

    function addValidatorRequest(
        address validator,
        uint256 threshold
    ) external onlyValidator {
        require(validator != address(0), "MultiSig: validator should not be the zero address");
        require(!isValidator[validator], "MultiSig: validator should not be a validator");
        require(threshold <= validators.length + 1, "MultiSig: threshold should be less than or equal to validators.length + 1");
        require(threshold > ((validators.length + 1) / 2), "MultiSig: threshold should be greater than (validators.length + 1) / 2");

        _recordChangeValidatorRequest(address(0), validator, threshold);
    }

    function deleteValidatorRequest(
        address validator,
        uint256 threshold
    ) external onlyValidator {
        require(validator != address(0), "MultiSig: validator should not be the zero address");
        require(isValidator[validator], "MultiSig: validator should be a validator");
        require(validators.length > 1, "MultiSig: validators.length should be greater than 1");
        require(threshold <= validators.length - 1, "MultiSig: threshold should be less than or equal to validators.length - 1");
        require(threshold > ((validators.length - 1) / 2), "MultiSig: threshold should be greater than (validators.length - 1) / 2");

        _recordChangeValidatorRequest(validator, address(0), threshold);
    }

    function updateValidatorRequest(
        address oldValidator,
        address newValidator,
        uint256 threshold
    ) external onlyValidator {
        require(oldValidator != address(0), "MultiSig: old validator should not be the zero address");
        require(newValidator != address(0), "MultiSig: new validator should not be the zero address");
        require(isValidator[oldValidator], "MultiSig: old validator should be a validator");
        require(!isValidator[newValidator], "MultiSig: new validator should not be a validator");
        require(threshold <= validators.length, "MultiSig: threshold should be less than or equal to validators.length");
        require(threshold > (validators.length / 2), "MultiSig: threshold should be greater than validators.length / 2");

        _recordChangeValidatorRequest(oldValidator, newValidator, threshold);
    }

    function approveChangeValidatorRequest(
        bytes32 txId
    ) external onlyValidator {
        ValidatorTx storage validatorTx = validatorTxs[txId];

        require(!validatorTx.executed, "MultiSig: change validator request is already executed");
        require(!validatorTx.isConfirmed[msg.sender], "MultiSig: caller has already confirmed");
        require(!isValidator[validatorTx.newValidator], "MultiSig: new validator should not be a validator");

        validatorTx.isConfirmed[msg.sender] = true;
        uint256 signedCount = 0;
        for (uint i = 0; i < validators.length; i++) {
            if (validatorTx.isConfirmed[validators[i]]) {
                signedCount++;
            }
        }

        emit ChangeValidatorApproved(txId, signedCount);

        if (signedCount >= requiredSignatureCount) {
            if (validatorTx.oldValidator == address(0)) {
                _addValidator(validatorTx.newValidator);
            } else if (validatorTx.newValidator == address(0)) {
                _deleteValidator(validatorTx.oldValidator);
            } else {
                _updateValidator(validatorTx.oldValidator, validatorTx.newValidator);
            }

            requiredSignatureCount = validatorTx.threshold;
            validatorTx.executed = true;

            emit ExecuteChangeValidator(txId);
        }
    }

    function submitTransaction(
        address to,

        bytes memory data
    ) external payable onlyValidator {
        txCount++;
        bytes32 txId = keccak256(abi.encodePacked(to, data, txCount));
        Transaction storage transaction = transactions[txId];

        transaction.to = to;
        transaction.value = msg.value;
        transaction.data = data;

        emit SubmitTransaction(txId, txCount);
    }

    function approveTransaction(bytes32 txId) external onlyValidator {
        Transaction storage transaction = transactions[txId];

        require(!transaction.executed, "MultiSig: transaction is already executed");
        require(!transaction.isConfirmed[msg.sender], "MultiSig: caller has already confirmed");

        transaction.isConfirmed[msg.sender] = true;

        uint256 signedCount = 0;
        for (uint i = 0; i < validators.length; i++) {
            if (transaction.isConfirmed[validators[i]]) {
                signedCount++;
            }
        }

        emit ApproveTransaction(txId, signedCount);

        if (signedCount >= requiredSignatureCount) {
            transaction.executed = true;
            (bool success, bytes memory data) = transaction.to.call{value: transaction.value}(transaction.data);
            if (!success) {
                revert TransactionFail(data);
            }

            emit ExecuteTransaction(txId);
        }
    }

    function getValidators() public view returns (address[] memory) {
        return validators;
    }

    function getUpdateValidatorStatus(bytes32 txId) public view returns (bool, uint256) {
        ValidatorTx storage validatorTx = validatorTxs[txId];
        uint256 signedCount = 0;
        for (uint i = 0; i < validators.length; i++) {
            if (validatorTx.isConfirmed[validators[i]]) {
                signedCount++;
            }
        }
        return (validatorTx.executed, signedCount);
    }

    function getTransactionStatus(bytes32 txId) public view returns (bool, uint256) {
        Transaction storage transaction = transactions[txId];
        uint256 signedCount = 0;
        for (uint i = 0; i < validators.length; i++) {
            if (transaction.isConfirmed[validators[i]]) {
                signedCount++;
            }
        }
        return (transaction.executed, signedCount);
    }

    function _recordChangeValidatorRequest(
        address oldValidator,
        address newValidator,
        uint256 threshold
    ) internal {
        changeValidatorCount++;
        bytes32 validatorTxId = keccak256(abi.encodePacked(oldValidator, newValidator, threshold, changeValidatorCount));
        ValidatorTx storage validatorTx = validatorTxs[validatorTxId];
        validatorTx.oldValidator = oldValidator;
        validatorTx.newValidator = newValidator;
        validatorTx.threshold = threshold;

        emit ChangeValidatorRequest(validatorTxId, changeValidatorCount);
    }

    function _addValidator(address validator) internal {
        validators.push(validator);
        isValidator[validator] = true;
    }
    function _deleteValidator(address validator) internal {
        for (uint i = 0; i < validators.length; i++) {
            if (validators[i] == validator) {
                validators[i] = validators[validators.length - 1];
                validators.pop();
                break;
            }
        }
        isValidator[validator] = false;
    }
    function _updateValidator(address oldValidator, address newValidator) internal {
        for (uint i = 0; i < validators.length; i++) {
            if (validators[i] == oldValidator) {
                validators[i] = newValidator;
                break;
            }
        }
        isValidator[oldValidator] = false;
        isValidator[newValidator] = true;
    }
}
