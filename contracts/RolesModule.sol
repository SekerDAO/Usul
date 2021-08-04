// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.0;

import "./common/Enum.sol";
import "./interfaces/ISafe.sol";
import "./interfaces/IVoting.sol";

contract Roles {
    struct Role {
        bytes allowedMethodSignature;
        address target;
        bytes params;
    }

    struct Member {
        mapping(uint256 => Role) roles;
        uint256 numberOfRoles;
        bool headOfHouse;
        bool member;
        bool activeProposal;
    }

    mapping(address => Member) public _members;
    uint256 private _memberCount;
    address private _safe;

    modifier onlySafe() {
        require(msg.sender == _safe, "TW027");
        _;
    }

    constructor(address safe_) {
        _safe = safe_;
    }

    function memberCount() public view virtual returns (uint256) {
        return _memberCount;
    }

    function safeEnterMember(address member) external onlySafe {
        _members[member].member = true;
        _memberCount++;
    }

    function safeRemoveMember(address member) external onlySafe {
        _members[member].member = false;
        _memberCount--;
    }

    function safeAddRole(address member, Role memory role) external onlySafe {
        _members[member].roles[_members[member].numberOfRoles++] = role;
        _members[member].numberOfRoles++;
    }

    function safeRemoveRole(address member, uint256 roleId) external onlySafe {
        delete _members[member].roles[roleId];
        _members[member].numberOfRoles--;
    }

    function executeModuleByRole(
        uint256 roleId,
        address member,
        address targetAddress,
        uint256 value,
        bytes memory data,
        bytes memory methodSignature,
        bytes memory parameters
    ) external //Enum.Operation _operation
    {
        require(_members[member].member == true, "TW028");
        require(
            _members[member].roles[roleId].target == targetAddress,
            "TW029"
        );
        // TODO bytes lib for data equality check
        // TODO combine methodsig and params to make call
        // build the safe tx based on allowed bytes
        ISafe(_safe).execTransactionFromModule(
            targetAddress,
            value,
            data,
            Enum.Operation.Call
        );
    }
}
