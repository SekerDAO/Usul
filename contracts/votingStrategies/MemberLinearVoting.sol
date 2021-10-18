// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "./BaseTokenVoting.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Seele strategy that enables compount like voting.
/// @author Nathan Ginnever - <team@tokenwalk.org>
contract MemberLinearVoting is BaseTokenVoting {
    ERC20Votes public immutable governanceToken;
    uint256 public memberCount;

    mapping(address => bool) public members;

    modifier onlyMember() {
        require(members[msg.sender] == true);
        _;
    }

    event MemberAdded(address member);
    event MemverRemoved(address member);

    constructor(
        address _owner,
        ERC20Votes _governanceToken,
        address _seeleModule,
        uint256 _quorumThreshold,
        uint256 _timeLockPeriod,
        uint256 _votingPeriod,
        string memory name_
    )
        BaseTokenVoting(
            _owner,
            _seeleModule,
            _votingPeriod,
            _quorumThreshold,
            _timeLockPeriod,
            name_
        )
    {
        require(
            _governanceToken != ERC20Votes(address(0)),
            "invalid governance token address"
        );
        governanceToken = _governanceToken;
    }

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
        return
            governanceToken.getPastVotes(
                voter,
                proposals[proposalId].startBlock
            );
    }
}
