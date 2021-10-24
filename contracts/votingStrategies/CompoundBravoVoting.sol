// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20VotesComp.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "../extensions/BaseTokenVoting.sol";

/// @title Compound like Linear Voting Strategy - A Seele strategy that enables compound like voting.
/// @notice This strategy differs in a few ways from compound bravo
/// @notice There are no min/max threshold checks
/// @notice There are no limits to the number of transactions that can be executed, hashes stored on proposal core
/// @notice More than one active proposal per proposer is allowed
/// @notice Only owner is allowed to cancel proposals (safety strat or governance)
/// @author Nathan Ginnever - <team@hyphal.xyz>
contract CompoundBravoVoting is BaseTokenVoting {
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

    ERC20VotesComp public governanceToken;
    uint256 public proposalThreshold;

    mapping(uint256 => ProposalComp) proposalsComp;

    event ProposalThresholdUpdated(
        uint256 previousThreshold,
        uint256 newThreshold
    );

    constructor(
        address _owner,
        ERC20VotesComp _governanceToken,
        address _seeleModule,
        uint256 _votingPeriod,
        uint256 _quorumThreshold,
        uint256 _timeLockPeriod,
        uint256 _proposalThreshold,
        string memory name_
    ) {
        bytes memory initParams = abi.encode(
            _owner,
            _governanceToken,
            _seeleModule,
            _votingPeriod,
            _quorumThreshold,
            _timeLockPeriod,
            _proposalThreshold,
            name_
        );
        setUp(initParams);
    }

    function setUp(bytes memory initParams) public override initializer {
        (
            address _owner,
            ERC20VotesComp _governanceToken,
            address _seeleModule,
            uint256 _votingPeriod,
            uint256 _quorumThreshold,
            uint256 _timeLockPeriod,
            uint256 _proposalThreshold,
            string memory name_
        ) = abi.decode(
                initParams,
                (
                    address,
                    ERC20VotesComp,
                    address,
                    uint256,
                    uint256,
                    uint256,
                    uint256,
                    string
                )
            );
        require(_votingPeriod > 1, "votingPeriod must be greater than 1");
        require(
            _governanceToken != ERC20VotesComp(address(0)),
            "invalid governance token address"
        );
        governanceToken = _governanceToken;
        proposalThreshold = _proposalThreshold;
        __Ownable_init();
        __EIP712_init_unchained(name_, version());
        transferOwnership(_owner);
        votingPeriod = _votingPeriod * 1 seconds; // switch to hours in prod
        seeleModule = _seeleModule;
        quorumThreshold = _quorumThreshold;
        timeLockPeriod = _timeLockPeriod * 1 seconds;
        emit StrategySetup(_seeleModule, _owner);
    }

    /// @dev Updates the votes needed to create a proposal, only executor.
    /// @param _proposalThreshold the voting quorum threshold.
    function updateProposalThreshold(uint256 _proposalThreshold)
        external
        onlyOwner
    {
        uint256 previousThreshold = proposalThreshold;
        proposalThreshold = _proposalThreshold;
        emit ProposalThresholdUpdated(previousThreshold, _proposalThreshold);
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
        proposalsComp[proposalId].receipts[msg.sender].votes = SafeCast
            .toUint96(calculateWeight(msg.sender, proposalId));
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
        proposalsComp[proposalId].receipts[voter].votes = SafeCast.toUint96(
            calculateWeight(voter, proposalId)
        );
        _vote(proposalId, voter, support);
    }

    /// @dev Called by the proposal module, this notifes the strategy of a new proposal.
    /// @param data any extra data to pass to the voting strategy
    function receiveProposal(bytes memory data) external override onlySeele {
        (uint256 proposalId, address proposer, bytes32 _descriptionHash) = abi
            .decode(data, (uint256, address, bytes32));
        require(
            governanceToken.getPriorVotes(proposer, sub256(block.number, 1)) >
                proposalThreshold,
            "proposer votes below proposal threshold"
        );
        proposalsComp[proposalId].descriptionHash = _descriptionHash;
        proposals[proposalId].deadline = votingPeriod + block.timestamp;
        proposals[proposalId].startBlock = block.number;
        emit ProposalReceived(proposalId, block.timestamp);
    }

    /// @notice ERC20VotesComp casts the getPastVotes to uint96, this upcasts back to uint256
    function calculateWeight(address delegatee, uint256 proposalId)
        public
        view
        override
        returns (uint256)
    {
        return
            governanceToken.getPriorVotes(
                delegatee,
                proposals[proposalId].startBlock
            );
    }

    function sub256(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b <= a, "subtraction underflow");
        return a - b;
    }
}
