// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.6;

import "@gnosis/zodiac/contracts/core/Modifier.sol";

contract Roles is Modifier {
    struct Function {
        bool allowed;
        bool scoped;
        bool delegateCallAllowed;
        mapping(bytes32 => bool) allowedParameters;
    }

    struct Target {
        bool allowed;
        bool scoped;
        bool delegateCallAllowed; // maybe unnecessary
        mapping(bytes4 => Function) allowedFunctions;
    }

    struct Role {
        address member;
        mapping(address => Target) allowedTargets;
    }

    address public safe;
    mapping(address => Role) public memberRoles;

    modifier onlySafe() {
        require(msg.sender == safe, "TW025");
        _;
    }

    event TargetAllowed(address target);
    event TargetDisallowed(address target);
    event FunctionAllowedOnTarget(address target, bytes4 functionSig);
    event FunctionDisallowedOnTarget(address target, bytes4 functionSig);
    event ParameterAllowedOnFunction(
        address target,
        bytes4 functionSig,
        bytes32 parameterHash
    );
    event ParameterDisallowedOnFunction(
        address target,
        bytes4 functionSig,
        bytes32 parameterHash
    );
    event TargetScoped(address target, bool scoped);
    event FunctionScoped(address target, bytes4 functionSig, bool scoped);
    event DelegateCallsAllowedOnTarget(address target);
    event DelegateCallsDisallowedOnTarget(address target);
    event ScopeGuardSetup(address indexed initiator, address indexed owner);

    constructor(address _safe) {
        __Ownable_init();
        modules[SENTINEL_MODULES] = SENTINEL_MODULES;
        safe = _safe;
    }

    /// @dev Allows multisig owners to make call to an address.
    /// @notice Only callable by owner.
    /// @param target Address to be allowed.
    function allowTarget(address member, address target) public onlySafe {
        memberRoles[member].allowedTargets[target].allowed = true;
        emit TargetAllowed(target);
    }

    /// @dev Disallows multisig owners to make call to an address.
    /// @notice Only callable by owner.
    /// @param target Address to be disallowed.
    function disallowTarget(address member, address target) public onlySafe {
        memberRoles[member].allowedTargets[target].allowed = false;
        emit TargetDisallowed(target);
    }

    /// @dev Allows multisig owners to call specific function on a scoped address.
    /// @notice Only callable by owner.
    /// @param target Address that the function should be allowed.
    /// @param functionSig Function signature to be allowed.
    function allowFunction(
        address member,
        address target,
        bytes4 functionSig
    ) public onlySafe {
        memberRoles[member]
            .allowedTargets[target]
            .allowedFunctions[functionSig]
            .allowed = true;
        emit FunctionAllowedOnTarget(target, functionSig);
    }

    /// @dev Disallows multisig owners to call specific function on a scoped address.
    /// @notice Only callable by owner.
    /// @param target Address that the function should be disallowed.
    /// @param functionSig Function signature to be disallowed.
    function disallowFunction(
        address member,
        address target,
        bytes4 functionSig
    ) public onlySafe {
        memberRoles[member]
            .allowedTargets[target]
            .allowedFunctions[functionSig]
            .allowed = false;
        emit FunctionDisallowedOnTarget(target, functionSig);
    }

    /// @dev Allows multisig owners to make delegate calls to an address.
    /// @notice Only callable by owner.
    /// @param target Address to which delegate calls will be allowed.
    function allowDelegateCall(address member, address target) public onlySafe {
        memberRoles[member].allowedTargets[target].delegateCallAllowed = true;
        emit DelegateCallsAllowedOnTarget(target);
    }

    /// @dev Disallows multisig owners to make delegate calls to an address.
    /// @notice Only callable by owner.
    /// @param target Address to which delegate calls will be disallowed.
    function disallowDelegateCall(address member, address target)
        public
        onlySafe
    {
        memberRoles[member].allowedTargets[target].delegateCallAllowed = false;
        emit DelegateCallsDisallowedOnTarget(target);
    }

    /// @dev Sets whether or not calls to an address should be scoped to specific function signatures.
    /// @notice Only callable by owner.
    /// @param target Address that will be scoped/unscoped.
    function toggleTargetScoped(address member, address target)
        public
        onlySafe
    {
        memberRoles[member].allowedTargets[target].scoped = !memberRoles[member]
            .allowedTargets[target]
            .scoped;
        emit TargetScoped(
            target,
            memberRoles[member].allowedTargets[target].scoped
        );
    }

    /// @dev Sets whether or not calls to an address and function should be scoped to specific parameters.
    /// @notice Only callable by owner.
    /// @param target Address that will be scoped/unscoped.
    function toggleFunctionScoped(
        address member,
        address target,
        bytes4 functionSig
    ) public onlySafe {
        memberRoles[member]
            .allowedTargets[target]
            .allowedFunctions[functionSig]
            .scoped = !memberRoles[member]
            .allowedTargets[target]
            .allowedFunctions[functionSig]
            .scoped;
        emit FunctionScoped(
            target,
            functionSig,
            memberRoles[member]
                .allowedTargets[target]
                .allowedFunctions[functionSig]
                .scoped
        );
    }

    /// @dev Allows multisig owners to call specific paramters on a scoped address and function.
    /// @notice Only callable by owner.
    /// @param target Address that the function should be allowed.
    /// @param functionSig Function signature to be allowed.
    /// @param dataHash Hash of the calldata containing allowed parameters
    function allowParameters(
        address member,
        address target,
        bytes4 functionSig,
        bytes32 dataHash
    ) public onlySafe {
        memberRoles[member]
            .allowedTargets[target]
            .allowedFunctions[functionSig]
            .allowedParameters[dataHash] = true;
        emit ParameterAllowedOnFunction(target, functionSig, dataHash);
    }

    /// @dev Disallows multisig owners to call specific parameters on a scoped address.
    /// @notice Only callable by owner.
    /// @param target Address that the function should be disallowed.
    /// @param functionSig Function signature to be disallowed.
    /// @param dataHash Hash of the calldata containing disallowed parameters
    function disallowParameters(
        address member,
        address target,
        bytes4 functionSig,
        bytes32 dataHash
    ) public onlySafe {
        memberRoles[member]
            .allowedTargets[target]
            .allowedFunctions[functionSig]
            .allowedParameters[dataHash] = false;
        emit ParameterDisallowedOnFunction(target, functionSig, dataHash);
    }

    /// @dev Returns bool to indicate if an address is an allowed target.
    /// @param target Address to check.
    function isAllowedTarget(address member, address target)
        public
        view
        returns (bool)
    {
        return (memberRoles[member].allowedTargets[target].allowed);
    }

    /// @dev Returns bool to indicate if a function signature is allowed for a target address.
    /// @param target Address to check.
    /// @param functionSig Signature to check.
    function isAllowedFunction(
        address member,
        address target,
        bytes4 functionSig
    ) public view returns (bool) {
        return (
            memberRoles[member]
                .allowedTargets[target]
                .allowedFunctions[functionSig]
                .allowed
        );
    }

    /// @dev Returns bool to indicate if parameters are allowed for a target address and function.
    /// @param target Address to check.
    /// @param functionSig Signature to check.
    /// @param dataHash Hash of calldata containg parameters to check
    function isAllowedParameters(
        address member,
        address target,
        bytes4 functionSig,
        bytes32 dataHash
    ) public view returns (bool) {
        return (memberRoles[member]
            .allowedTargets[target]
            .allowedFunctions[functionSig]
            .allowedParameters[dataHash] == true);
    }

    /// @dev Returns bool to indicate if an address is scoped.
    /// @param target Address to check.
    function isTargetScoped(address member, address target)
        public
        view
        returns (bool)
    {
        return (memberRoles[member].allowedTargets[target].scoped);
    }

    /// @dev Returns bool to indicate if an address is scoped.
    /// @param target Address to check.
    function isFunctionScoped(
        address member,
        address target,
        bytes4 functionSig
    ) public view returns (bool) {
        return (
            memberRoles[member]
                .allowedTargets[target]
                .allowedFunctions[functionSig]
                .scoped
        );
    }

    /// @dev Returns bool to indicate if delegate calls are allowed to a target address.
    /// @param target Address to check.
    function isAllowedToDelegateCall(address member, address target)
        public
        view
        returns (bool)
    {
        return (memberRoles[member].allowedTargets[target].delegateCallAllowed);
    }

    // solhint-disallow-next-line payable-fallback
    fallback() external {
        // We don't revert on fallback to avoid issues in case of a Safe upgrade
        // E.g. The expected check method might change and then the Safe would be locked.
    }

    function checkTransaction(
        address member,
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) external {
        bool targetScoped = memberRoles[member].allowedTargets[to].scoped;
        bool functionScoped = memberRoles[member]
            .allowedTargets[to]
            .allowedFunctions[bytes4(data)]
            .scoped;
        require(
            operation != Enum.Operation.DelegateCall ||
                memberRoles[member].allowedTargets[to].delegateCallAllowed,
            "Delegate call not allowed to this address"
        );
        require(isAllowedTarget(member, to), "Target address is not allowed");
        if (data.length >= 4) {
            require(
                !targetScoped || isAllowedFunction(member, to, bytes4(data)),
                "Target function is not allowed"
            );
            require(
                !functionScoped ||
                    isAllowedParameters(
                        member,
                        to,
                        bytes4(data),
                        keccak256(data)
                    ),
                "Cannot send with these parameters"
            );
            require(exec(to, value, data, operation));
        } else {
            require(
                !targetScoped || isAllowedFunction(member, to, bytes4(0)),
                "Cannot send to this address"
            );
            require(exec(to, value, data, operation));
        }
    }

    function checkAfterExecution(bytes32, bool) external {}

    function setUp(bytes calldata initializeParams) public virtual override {}
}
