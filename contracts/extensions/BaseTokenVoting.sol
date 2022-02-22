// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../BaseStrategy.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Usul strategy that enables compound like voting.
/// @author Nathan Ginnever - <team@hyphal.xyz>
abstract contract BaseTokenVoting is BaseStrategy, EIP712Upgradeable {
    bytes32 public constant VOTE_TYPEHASH =
        keccak256("Vote(uint256 proposalId,uint8 vote)");

    enum VoteType {
        Against,
        For,
        Abstain
    }

    struct ProposalVoting {
        uint256 yesVotes; // the total number of YES votes for this proposal
        uint256 noVotes; // the total number of NO votes for this proposal
        uint256 abstainVotes; // introduce abstain votes
        uint256 deadline; // voting deadline TODO: consider using block number
        uint256 startBlock; // the starting block of the proposal
        mapping(address => bool) hasVoted;
    }

    uint256 public votingPeriod; // the length of time voting is valid for a proposal
    uint256 public timeLockPeriod;
    string public name;

    mapping(uint256 => ProposalVoting) public proposals;

    event TimeLockUpdated(uint256 previousTimeLock, uint256 newTimeLockPeriod);
    event VotingPeriodUpdated(
        uint256 previousVotingPeriod,
        uint256 newVotingPeriod
    );
    event ProposalReceived(uint256 proposalId, uint256 timestamp);
    event VoteFinalized(uint256 proposalId, uint256 timestamp);
    event Voted(
        address voter,
        uint256 proposalId,
        uint8 support,
        uint256 weight
    );

    ///@dev ERC712 version.
    function version() public view virtual returns (string memory) {
        return "1";
    }

    /// @dev Updates the time that proposals are active for voting.
    /// @param newPeriod the voting window.
    function updateVotingPeriod(uint256 newPeriod) external onlyOwner {
        uint256 previousVotingPeriod = votingPeriod;
        votingPeriod = newPeriod;
        emit VotingPeriodUpdated(previousVotingPeriod, newPeriod);
    }

    /// @dev Updates the grace period time after a proposal passed before it can execute.
    /// @param newTimeLockPeriod the new delay before execution.
    function updateTimeLockPeriod(uint256 newTimeLockPeriod)
        external
        onlyOwner
    {
        uint256 previousTimeLock = timeLockPeriod;
        timeLockPeriod = newTimeLockPeriod;
        emit TimeLockUpdated(previousTimeLock, newTimeLockPeriod);
    }

    /// @dev Returns true if an account has voted on a specific proposal.
    /// @param proposalId the proposal to inspect.
    /// @param account the account to inspect.
    /// @return boolean.
    function hasVoted(uint256 proposalId, address account)
        public
        view
        returns (bool)
    {
        return proposals[proposalId].hasVoted[account];
    }

    /// @dev Submits a vote for a proposal.
    /// @param proposalId the proposal to vote for.
    /// @param support against, for, or abstain.
    function vote(
        uint256 proposalId,
        uint8 support,
        bytes memory
    ) external virtual {
        _vote(proposalId, msg.sender, support);
    }

    /// @dev Submits a vote for a proposal by ERC712 signature.
    /// @param proposalId the proposal to vote for.
    /// @param support against, for, or abstain.
    /// @param signature 712 signed vote.
    function voteSignature(
        uint256 proposalId,
        uint8 support,
        bytes memory signature,
        bytes memory
    ) external virtual {
        address voter = ECDSA.recover(
            _hashTypedDataV4(
                keccak256(abi.encode(VOTE_TYPEHASH, proposalId, support))
            ),
            signature
        );
        _vote(proposalId, voter, support);
    }

    function _vote(
        uint256 proposalId,
        address voter,
        uint8 support
    ) internal {
        require(
            block.timestamp <= proposals[proposalId].deadline,
            "voting period has passed"
        );
        require(!hasVoted(proposalId, voter), "voter has already voted");
        proposals[proposalId].hasVoted[voter] = true;
        uint256 weight = calculateWeight(voter, proposalId);
        if (support == uint8(VoteType.Against)) {
            proposals[proposalId].noVotes += weight;
        } else if (support == uint8(VoteType.For)) {
            proposals[proposalId].yesVotes += weight;
        } else if (support == uint8(VoteType.Abstain)) {
            proposals[proposalId].abstainVotes += weight;
        } else {
            revert("invalid value for enum VoteType");
        }
        emit Voted(voter, proposalId, support, weight);
    }

    /// @dev Called by the proposal module, this notifes the strategy of a new proposal.
    /// @param data any extra data to pass to the voting strategy
    function receiveProposal(bytes memory data)
        external
        virtual
        override
        onlyUsul
    {
        uint256 proposalId = abi.decode(data, (uint256));
        proposals[proposalId].deadline = votingPeriod + block.timestamp;
        proposals[proposalId].startBlock = block.number;
        emit ProposalReceived(proposalId, block.timestamp);
    }

    /// @dev Calls the proposal module to notify that a quorum has been reached.
    /// @param proposalId the proposal to vote for.
    function finalizeStrategy(uint256 proposalId) public virtual override {
        if (isPassed(proposalId)) {
            IProposal(UsulModule).receiveStrategy(proposalId, timeLockPeriod);
        }
        emit VoteFinalized(proposalId, block.timestamp);
    }

    function calculateWeight(address voter, uint256 proposalId)
        public
        view
        virtual
        returns (uint256);
}
