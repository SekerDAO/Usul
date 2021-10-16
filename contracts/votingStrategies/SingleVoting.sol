// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "./BaseTokenVoting.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Seele strategy that enables compount like voting.
/// @author Nathan Ginnever - <team@tokenwalk.org>
contract SingleVoting is BaseTokenVoting {
    uint256 public memberCount;

    mapping(address => bool) public members;

    modifier onlyMember() {
        require(members[msg.sender] == true);
        _;
    }

    event MemberAdded(address member);
    event MemverRemoved(address member);

    constructor(
        uint256 _votingPeriod,
        address _seeleModule,
        uint256 _quorumThreshold,
        uint256 _timeLockPeriod,
        address _owner,
        string memory name_
    )
        BaseTokenVoting(
            _votingPeriod,
            _seeleModule,
            _quorumThreshold,
            _timeLockPeriod,
            _owner,
            name_
        )
    {}

    function addMember(address member) public onlyOwner {
        members[member] = true;
        memberCount++;
        emit MemberAdded(member);
    }

    function removeMember(address member) public onlyOwner {
        members[member] = false;
        memberCount--;
        emit MemverRemoved(member);
    }

    function calculateWeight(address voter, uint256 proposalId)
        public
        view
        override
        returns (uint256)
    {
        require(members[voter], "voter is not a member");
        return 1;
    }
}
