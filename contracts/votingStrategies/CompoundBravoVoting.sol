// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20VotesComp.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "./BaseTokenVoting.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Seele strategy that enables compount like voting.
/// @author Nathan Ginnever - <team@tokenwalk.org>
contract CompoundBravoVoting is BaseTokenVoting {

    ERC20VotesComp public immutable governanceToken;

    /**
     * @dev Receipt structure from Compound Governor Bravo
     */
    struct Receipt {
        bool hasVoted;
        uint8 support;
        uint96 votes;
    }

    struct ProposalComp {
        mapping(address => Receipt) receipts;
        bytes32 descriptionHash;
    }

    mapping(uint256 => ProposalComp) proposalsComp;

    constructor(
        uint256 _votingPeriod,
        ERC20VotesComp _governanceToken,
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
        require(_governanceToken != ERC20VotesComp(address(0)), "invalid governance token address");
        governanceToken = _governanceToken;
    }

    /**
     * @dev See {IGovernorCompatibilityBravo-getReceipt}.
     */
    function getReceipt(uint256 proposalId, address voter)
        public
        view
        returns (Receipt memory)
    {
        return proposalsComp[proposalId].receipts[voter];
    }

    /// @dev Submits a vote for a proposal.
    /// @param proposalId the proposal to vote for.
    /// @param support against, for, or abstain.
    function vote(uint256 proposalId, uint8 support) external override {
        proposalsComp[proposalId].receipts[msg.sender].hasVoted = true;
        proposalsComp[proposalId].receipts[msg.sender].support = support;
        proposalsComp[proposalId].receipts[msg.sender].votes = SafeCast.toUint96(calculateWeight(msg.sender, proposalId));
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
        proposalsComp[proposalId].receipts[voter].hasVoted = true;
        proposalsComp[proposalId].receipts[voter].support = support;
        proposalsComp[proposalId].receipts[voter].votes = SafeCast.toUint96(calculateWeight(voter, proposalId));
        _vote(proposalId, voter, support);
    }

    /// @dev Called by the proposal module, this notifes the strategy of a new proposal.
    /// @param data any extra data to pass to the voting strategy
    function receiveProposal(bytes memory data) external override onlySeele {
        (uint256 proposalId, bytes32 _descriptionHash) = abi.decode(
            data,
            (uint256, bytes32)
        );
        proposalsComp[proposalId].descriptionHash = _descriptionHash;
        proposals[proposalId].deadline = votingPeriod + block.timestamp;
        proposals[proposalId].startBlock = block.number;
        emit ProposalReceived(proposalId, block.timestamp);
    }

    function calculateWeight(address delegatee, uint256 proposalId)
        public
        override
        view
        returns (uint256)
    {
        return governanceToken.getPastVotes(delegatee, proposals[proposalId].startBlock);
    }
}
