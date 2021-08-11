// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.0;

import "@gnosis/zodiac/contracts/core/Module.sol";
import "./interfaces/IVoting.sol";

contract Roles is Module {
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
    uint256 private _totalRoles;
    address private _safe;
    bool private _mustBeMember;

    modifier onlySafe() {
        require(msg.sender == _safe, "TW025");
        _;
    }

    constructor() {
        __Ownable_init();
    }

    function memberCount() public view virtual returns (uint256) {
        return _memberCount;
    }

    function checkMembership(address member)
        public
        view
        virtual
        returns (bool)
    {
        if (!_mustBeMember) {
            return true;
        } else {
            return _members[member].member;
        }
    }

    function setMustBeMember(bool set) external onlySafe {
        _mustBeMember = set;
    }

    function safeEnterMember(address member) external onlySafe {
        _members[member].member = true;
        _memberCount++;
    }

    function safeRemoveMember(address member) external onlySafe {
        _members[member].member = false;
        _memberCount--;
    }

    function safeAddRole(
        address member,
        Role memory role,
        uint256 roleId
    ) external onlySafe {
        _members[member].roles[roleId] = role;
        _members[member].numberOfRoles++;
        _totalRoles++; // used to keep db informed of what the roleId should be if new role
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
        bytes memory parameters //Enum.Operation _operation
    ) external {
        require(_members[member].member == true, "TW026");
        require(
            _members[member].roles[roleId].target == targetAddress,
            "TW027"
        );
        // TODO bytes lib for data equality check
        // TODO combine methodsig and params to make call
        // build the safe tx based on allowed bytes
        exec(
            targetAddress,
            value,
            data,
            Enum.Operation.Call
        );
    }
}
