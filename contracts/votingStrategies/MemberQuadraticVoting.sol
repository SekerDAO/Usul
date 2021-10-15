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
        uint256 _votingPeriod,
        ERC20Votes _governanceToken,
        address _seeleModule,
        uint256 _quorumThreshold,
        uint256 _timeLockPeriod,
        address _owner,
        string memory name_
    ) BaseTokenVoting(
        _votingPeriod,
        _seeleModule,
        _quorumThreshold,
        _timeLockPeriod,
        _owner,
        name_
    ) {
        require(_governanceToken != ERC20Votes(address(0)), "invalid governance token address");
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
        override
        view
        returns (uint256)
    {
        require(members[voter], "voter is not a member");
        return sqrt(governanceToken.getPastVotes(voter, proposals[proposalId].startBlock));
    }

    function sqrt(uint256 x) internal pure returns (uint256 y) {
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
