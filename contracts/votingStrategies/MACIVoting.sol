// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "../extensions/BaseMember.sol";
import "./MACI/IMACI.sol";
import "./MACI/IParams.sol";
import "./MACI/IPubKey.sol";
import "./MACI/IPoll.sol";

struct Proposal {
    address maci;
    address poll;
    bool finalized;
    bool cancelled;
    bool passed;
    bytes32 tallyHash;
}

/// @title MACI Voting - A Usul strategy that enables secret voting using MACI.
/// @author Nathan Ginnever - <team@hyphal.xyz> & Auryn Macmillan - <auryn.macmillan@gnosis.io>
contract MACIVoting is BaseMember, IPubKey, IParams {
    address public coordinator;
    address public MACI;

    PubKey public coordinatorPubKey;

    uint256 public duration;
    uint256 public timeLockPeriod;

    mapping(uint256 => Proposal) public proposals;
    mapping(address => bool) public registered;

    MaxValues public maxValues;
    TreeDepths public treeDepths;

    event MACIFacotrySet(address MACIFactory);
    event ProposalReceived(uint256 proposalId, uint256 timestamp);
    event MemberRegistered(address member);
    event VoteFinalized(uint256 proposalId, uint256 timestamp);

    // Can only be called by MACI.
    error NotMACI(address sender);
    // `member` has already registered.
    error AlreadyRegistered(address member);
    // Address is not a member.
    error NotMember(address member);
    // Can only be called by coordinator.
    error NotCoordinator(address sender);
    // Proposal Already Finalized.
    error AlreadyFinalized();
    // Voting is still in progress.
    error VotingInProgress();
    // MACI address cannot be set to zero.
    error MACIAddressCannotBeZero();
    // Tallying is incomplete.
    error TallyingIncomplete();
    // Tally has has not been published.
    error TallyHashNotPublished();
    // Incorrect value provided for _totalSpent or _totalSpentSalt.
    error IncorrectTotalSpent();
    // Proposal has been cancelled.
    error ProposalCancelled();
    // _spent or _spentProof are not equal to 2.
    error IncorrectArrayLength();
    // Incorrect amount of spent voice credits.
    error IncorrectSpentVoiceCredits();
    // MACI PollId provided already exists.
    error PollIdAlreadyExists();
    // MACI PollId provided does not correspond to the next MACI pollId.
    error PollIdIsNotNext();

    modifier onlyMACI() {
        if (msg.sender != MACI) revert NotMACI(msg.sender);
        _;
    }

    modifier onlyCoordinator() {
        if (msg.sender != coordinator) revert NotCoordinator(msg.sender);
        _;
    }

    constructor(bytes memory initializeParams) {
        setUp(initializeParams);
    }

    function setUp(bytes memory initializeParams) public override {}

    // @dev Acts as signup gatekeeper for MACI.
    function register(address member, bytes memory) public onlyMACI {
        if (!members[member]) revert NotMember(member);
        if (registered[member]) revert AlreadyRegistered(member);

        registered[member] = true;

        emit MemberRegistered(member);
    }

    // @dev Acts as voiceCreditProxy for MACI
    function getVoiceCredits(address, bytes memory)
        public
        pure
        returns (uint256 voiceCredits)
    {
        voiceCredits = 1;
    }

    function checkPoll(uint256 pollId) public view returns (bool) {
        try IMACI(MACI).getPoll(pollId) {
            return true;
        } catch {
            return false;
        }
    }

    /// @dev Called by the proposal module, this notifes the strategy of a new proposal.
    /// @param data any extra data to pass to the voting strategy
    function receiveProposal(bytes memory data) external override onlyUsul {
        (uint256 proposalId, , bytes memory _pollId) = abi.decode(
            data,
            (uint256, bytes32[], bytes)
        );

        uint256 pollId = abi.decode(_pollId, (uint256));
        // revert if pollId already exist
        if (checkPoll(pollId)) revert PollIdAlreadyExists();
        // revert if previous pollId does not exist
        if (!checkPoll(pollId - 1)) revert PollIdIsNotNext();

        // deploy MACI poll
        IMACI(MACI).deployPoll(
            duration,
            maxValues,
            treeDepths,
            coordinatorPubKey
        );

        // get poll address
        address poll = IMACI(MACI).getPoll(pollId);

        // map Usul proposal ID to MACI poll address
        proposals[proposalId].poll = poll;

        emit ProposalReceived(proposalId, block.timestamp);
    }

    function finalizeProposal(
        uint256 proposalId,
        uint256 totalSpent,
        uint256 totalSpentSalt,
        uint256[] memory spent,
        uint256[][][] calldata spentProof,
        uint256 spentSalt
    ) public {
        Proposal memory proposal = proposals[proposalId];

        if (proposal.finalized) revert AlreadyFinalized();

        if (!proposal.cancelled) revert ProposalCancelled();

        if (!IPoll(proposal.poll).isAfterDeadline()) revert VotingInProgress();

        (, uint256 tallyBatchSize, ) = IPoll(proposal.poll).batchSizes();
        uint256 batchStartIndex = IPoll(proposal.poll).tallyBatchNum() *
            tallyBatchSize;
        (uint256 numSignUps, ) = IPoll(proposal.poll).numSignUpsAndMessages();
        if (batchStartIndex <= numSignUps) revert TallyingIncomplete();

        if (proposal.tallyHash == bytes32(0)) revert TallyHashNotPublished();

        bool verified = IPoll(proposal.poll).verifySpentVoiceCredits(
            totalSpent,
            totalSpentSalt
        );
        if (!verified) revert IncorrectTotalSpent();

        if (spent.length != 2 || spentProof.length != 2)
            revert IncorrectArrayLength();

        for (uint256 index = 0; index < spent.length; index++) {
            bool spentVerified = IPoll(proposal.poll)
                .verifyPerVOSpentVoiceCredits(
                    index,
                    spent[index],
                    spentProof[index],
                    spentSalt
                );
            if (!spentVerified) revert IncorrectSpentVoiceCredits();
        }

        if (spent[0] < spent[1]) proposal.passed = true;
        proposal.finalized = true;
        finalizeStrategy(proposalId);
    }

    /// @dev Calls the proposal module to notify that a quorum has been reached.
    /// @param proposalId the proposal to vote for.
    function finalizeStrategy(uint256 proposalId) public virtual override {
        if (isPassed(proposalId)) {
            IProposal(UsulModule).receiveStrategy(proposalId, timeLockPeriod);
        }
        emit VoteFinalized(proposalId, block.timestamp);
    }

    /// @dev Determines if a proposal has succeeded.
    /// @param proposalId the proposal to vote for.
    /// @return boolean.
    function isPassed(uint256 proposalId) public view override returns (bool) {
        return proposals[proposalId].passed;
    }

    /// @dev Sets the MACI
    /// @param _MACI Address of the deployed MACI instance this
    function setMACI(address _MACI) public onlyOwner {
        if (_MACI == address(0)) revert MACIAddressCannotBeZero();
        MACI = _MACI;
        emit MACIFacotrySet(MACI);
    }
}
