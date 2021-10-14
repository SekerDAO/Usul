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
        address _avatar,
        string memory name_
    ) BaseTokenVoting(
        _votingPeriod,
        _seeleModule,
        _quorumThreshold,
        _timeLockPeriod,
        _avatar,
        name_
    ) {
        require(_governanceToken != ERC20Votes(address(0)), "invalid governance token address");
        governanceToken = _governanceToken;
    }

    function addMember(address member) public onlyAvatar {
        members[member] = true;
        memberCount++;
        emit MemberAdded(member);
    }

    function removeMember(address member) public onlyAvatar {
        members[member] = false;
        memberCount--;
        emit MemverRemoved(member);
    }

    /// @dev Submits a vote for a proposal.
    /// @param proposalId the proposal to vote for.
    /// @param support against, for, or abstain.
    function vote(uint256 proposalId, uint8 support) external override {
        require(members[msg.sender] != false, "voter is not a member");
        _vote(proposalId, msg.sender, support);
    }

    /// @dev Submits a vote for a proposal by ERC712 signature.
    /// @param proposalId the proposal to vote for.
    /// @param support against, for, or abstain.
    /// @param signature 712 signed vote
    function voteSignature(
        uint256 proposalId,
        uint8 support,
        bytes memory signature
    ) external override {
        address voter = ECDSA.recover(
            _hashTypedDataV4(
                keccak256(abi.encode(VOTE_TYPEHASH, proposalId, support))
            ),
            signature
        );
        require(members[voter] != false, "voter is not a member");
        _vote(proposalId, voter, support);
    }
}
