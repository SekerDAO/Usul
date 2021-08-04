// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.0;

import './common/Enum.sol';
import './interfaces/ISafe.sol';
import './interfaces/IVoting.sol';

contract Roles {
	struct Role {
        bytes allowedMethodSignature;
        address target;
        bytes params;
	}

    struct Member {
        mapping(uint => Role) roles;
        uint numberOfRoles;
        bool headOfHouse;
        bool member;
        bool activeProposal;
    }

    mapping(address => Member) public _members;
    uint private _memberCount;
    address private _safe;

    modifier onlySafe {
        require(msg.sender == _safe, "TW027");
        _;
    }


    constructor(
        address safe_
    ) {
        _safe = safe_;
    }

    function memberCount() public view virtual returns (uint) {
        return _memberCount;
    }

    function safeEnterMember(address member) onlySafe external {
        _members[member].member = true;
        _memberCount++;
    }

    function safeRemoveMember(address member) onlySafe external {
        _members[member].member = false;
        _memberCount--;
    }

    function safeAddRole(address member, Role memory role) onlySafe external {
        _members[member].roles[_members[member].numberOfRoles++] = role;
        _members[member].numberOfRoles++;
    }

    function safeRemoveRole(address member, uint roleId) onlySafe external {
        delete _members[member].roles[roleId];
        _members[member].numberOfRoles--;
    }

    function executeModuleByRole(
        uint roleId,
        address member,
        address targetAddress,
        uint value,
        bytes memory data,
        bytes memory methodSignature,
        bytes memory parameters
        //Enum.Operation _operation
    ) external {
        require(_members[member].member == true, "TW028");
        require(_members[member].roles[roleId].target == targetAddress, "TW029");
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