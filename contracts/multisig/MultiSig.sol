// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

contract MultiSig {
    event ChangeValidatorRequest(
        bytes32 indexed updateId,
        uint256 changeValidatorCount
    );
    event ChangeValidatorSigned(
        bytes32 indexed updateId,
        uint256 signedCount
    );
    event ExecuteChangeValidator(
        bytes32 indexed updateId
    );
    );

    struct Transaction {
        address destination;
        uint value;
        bytes data;
        bool executed;
        uint256 signedCount;

        mapping(address => bool) isConfirmed;
        mapping(address => bool) possibleValidators;
    }

    struct UpdateValidator {
        address oldValidator;
        address newValidator;
        uint256 threshold;
        bool executed;
        uint256 signedCount;

        mapping(address => bool) isConfirmed;
        mapping(address => bool) possibleValidators;
    }

    mapping(bytes32 => Transaction) public transactions;
    mapping(bytes32 => UpdateValidator) public updateValidators;

    address[] public validators;
    mapping(address => bool) public isValidator;
    uint256 public requiredSignatureCount;
    bool private changeValidatorFlag = false;

    uint256 public changeValidatorCount = 0;
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
        require(!changeValidatorFlag, "MultiSig: change validator request is already in progress");
        require(validator != address(0), "MultiSig: validator should not be the zero address");
        require(!isValidator[validator], "MultiSig: validator should not be a validator");
        require(threshold <= validators.length + 1, "MultiSig: threshold should be less than or equal to validators.length + 1");
        require(threshold > ((validators.length + 1) / 2), "MultiSig: threshold should be greater than (validators.length + 1) / 2");

        changeValidatorFlag = true;

        _updateValidator(address(0), validator, threshold);
    }

    function deleteValidatorRequest(
        address validator,
        uint256 threshold
    ) external onlyValidator {
        require(!changeValidatorFlag, "MultiSig: change validator request is already in progress");
        require(validator != address(0), "MultiSig: validator should not be the zero address");
        require(isValidator[validator], "MultiSig: validator should be a validator");
        require(validators.length > 1, "MultiSig: validators.length should be greater than 1");
        require(threshold <= validators.length - 1, "MultiSig: threshold should be less than or equal to validators.length - 1");
        require(threshold > ((validators.length - 1) / 2), "MultiSig: threshold should be greater than (validators.length - 1) / 2");

        changeValidatorFlag = true;

        _updateValidator(validator, address(0), threshold);
    }

    function updateValidatorRequest(
        address oldValidator,
        address newValidator,
        uint256 threshold
    ) external onlyValidator {
        require(!changeValidatorFlag, "MultiSig: change validator request is already in progress");
        require(oldValidator != address(0), "MultiSig: old validator should not be the zero address");
        require(newValidator != address(0), "MultiSig: new validator should not be the zero address");
        require(isValidator[oldValidator], "MultiSig: old validator should be a validator");
        require(!isValidator[newValidator], "MultiSig: new validator should not be a validator");
        require(threshold <= validators.length, "MultiSig: threshold should be less than or equal to validators.length");
        require(threshold > (validators.length / 2), "MultiSig: threshold should be greater than validators.length / 2");

        changeValidatorFlag = true;

        _updateValidator(oldValidator, newValidator, threshold);
    }

    function confirmChangeValidatorRequest(
        bytes32 updateId
    ) external onlyValidator {
        require(changeValidatorFlag, "MultiSig: change validator request is not in progress");
        UpdateValidator storage updateValidator = updateValidators[updateId];

        require(!updateValidator.executed, "MultiSig: change validator request is already executed");
        require(updateValidator.possibleValidators[msg.sender], "MultiSig: caller is not a possible validator");
        require(!updateValidator.isConfirmed[msg.sender], "MultiSig: caller has already confirmed");

        updateValidator.isConfirmed[msg.sender] = true;
        updateValidator.signedCount++;

        emit ChangeValidatorSigned(updateId, updateValidator.signedCount);

        if (updateValidator.signedCount >= requiredSignatureCount) {
            if (updateValidator.oldValidator == address(0)) {
                _addValidator(updateValidator.newValidator);
            } else if (updateValidator.newValidator == address(0)) {
                _deleteValidator(updateValidator.oldValidator);
            } else {
                _updateValidator(updateValidator.oldValidator, updateValidator.newValidator);
            }

            changeValidatorFlag = false;
            requiredSignatureCount = updateValidator.threshold;
            updateValidator.executed = true;

            emit ExecuteChangeValidator(updateId);
        }
    }

    function submitTransaction() external onlyValidator {}

    function confirmTransaction() external onlyValidator {}

    function getValidators() public view returns (address[] memory) {
        return validators;
    }

    function getUpdateValidatorStatus(bytes32 updateId) public view returns (bool, uint256) {
        UpdateValidator storage updateValidator = updateValidators[updateId];
        return (updateValidator.executed, updateValidator.signedCount);
    }

    function _updateValidator(
        address oldValidator,
        address newValidator,
        uint256 threshold
    ) internal {
        bytes32 updateId = keccak256(abi.encodePacked(oldValidator, newValidator, threshold, changeValidatorCount));
        UpdateValidator storage updateValidator = updateValidators[updateId];
        updateValidator.oldValidator = oldValidator;
        updateValidator.newValidator = newValidator;
        updateValidator.threshold = threshold;
        for (uint i = 0; i < validators.length; i++) {
            updateValidator.possibleValidators[validators[i]] = true;
        }

        emit ChangeValidatorRequest(updateId, changeValidatorCount);

        changeValidatorCount++;
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
