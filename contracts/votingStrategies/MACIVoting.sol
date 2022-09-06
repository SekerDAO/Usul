/// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "../extensions/BaseMember.sol";
import "./MACI/IMACI.sol";
import "./MACI/IParams.sol";
import "./MACI/IPubKey.sol";
import "./MACI/IPoll.sol";

struct Proposal {
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

    event CoordinatorSet(address coordinator, PubKey coordinatorPubKey);
    event DurationSet(uint256 duration);
    event MACIFacotrySet(address MACIFactory);
    event MaxValuesAndTreeDepthsSet(MaxValues maxValues, TreeDepths treeDepths);
    event MemberRegistered(address member);
    event ProposalReceived(uint256 proposalId, uint256 timestamp);
    event TimelockPeriodSet(uint256 timeLockPeriod);
    event VoteFinalized(uint256 proposalId, uint256 timestamp);

    /// Proposal Already Finalized.
    error AlreadyFinalized();
    /// `member` has already registered.
    error AlreadyRegistered(address member);
    /// Coordinator address cannot be set to zero.
    error CoordinatorAddressCannotBeZero();
    /// Incorrect amount of spent voice credits.
    error IncorrectSpentVoiceCredits();
    /// _spent or _spentProof are not equal to 2.
    error IncorrectArrayLength();
    /// Incorrect value provided for _totalSpent or _totalSpentSalt.
    error IncorrectTotalSpent();
    /// Invalid Max Values or Tree Depth provided.
    error InvalidMaxValues();
    /// MACI address cannot be set to zero.
    error MACIAddressCannotBeZero();
    /// Can only be called by coordinator.
    error NotCoordinator(address sender);
    /// Can only be called by MACI.
    error NotMACI(address sender);
    /// Address is not a member.
    error NotMember(address member);
    /// MACI PollId provided already exists.
    error PollIdAlreadyExists();
    /// MACI PollId provided does not correspond to the next MACI pollId.
    error PollIdIsNotNext();
    /// Proposal has been cancelled.
    error ProposalCancelled();
    /// Tally has has not been published.
    error TallyHashNotPublished();
    /// Tallying is incomplete.
    error TallyingIncomplete();
    /// Voting is still in progress.
    error VotingInProgress();

    modifier onlyCoordinator() {
        if (msg.sender != coordinator) revert NotCoordinator(msg.sender);
        _;
    }

    modifier onlyMACI() {
        if (msg.sender != MACI) revert NotMACI(msg.sender);
        _;
    }

    constructor(
        address _owner,
        address _coordinator,
        address _MACI,
        address _UsulModule,
        PubKey memory _coordinatorPubKey,
        uint256 _duration,
        uint256 _timeLockPeriod,
        MaxValues memory _maxValues,
        TreeDepths memory _treeDepths
    ) {
        bytes memory initializeParams = abi.encode(
            _owner,
            _coordinator,
            _MACI,
            _UsulModule,
            _coordinatorPubKey,
            _duration,
            _timeLockPeriod,
            _maxValues,
            _treeDepths
        );
        setUp(initializeParams);
    }

    function setUp(bytes memory initializeParams) public override {
        (
            address _owner,
            address _coordinator,
            address _MACI,
            address _UsulModule,
            PubKey memory _coordinatorPubKey,
            uint256 _duration,
            uint256 _timeLockPeriod,
            MaxValues memory _maxValues,
            TreeDepths memory _treeDepths
        ) = abi.decode(
                initializeParams,
                (
                    address,
                    address,
                    address,
                    address,
                    PubKey,
                    uint256,
                    uint256,
                    MaxValues,
                    TreeDepths
                )
            );
        __Ownable_init();
        setCoordinator(_coordinator, _coordinatorPubKey);
        setMACI(_MACI);
        setUsul(_UsulModule);
        setDuration(_duration);
        setTimeLockPeriod(_timeLockPeriod);
        setMaxValuesAndTreeDepths(_maxValues, _treeDepths);
        transferOwnership(_owner);
    }

    /// @dev Acts as signup gatekeeper for MACI.
    /// @param member Address of the member to be registered.
    /// @notice Can only be called by MACI.
    /// TODO: Break this function out into a separate signup gatekeeper contract to make this strategy more modular.
    function register(address member, bytes memory) public onlyMACI {
        if (!members[member]) revert NotMember(member);
        if (registered[member]) revert AlreadyRegistered(member);

        registered[member] = true;

        emit MemberRegistered(member);
    }

    /// @dev Acts as voiceCreditProxy for MACI
    /// @return voiceCredits Uint256 number of voice credits for the given member.
    /// @notice Returns 1 for all queries.
    /// @notice Can only be called by MACI.
    /// TODO: Break this function out into a separate voiceCredit proxy to make this strategy more modular.
    function getVoiceCredits(address, bytes memory)
        public
        pure
        returns (uint256 voiceCredits)
    {
        voiceCredits = 1;
    }

    /// @dev Checks to see if a given pollId exists on the current MACI instance.
    /// @param pollId Uint256 identifier to check.
    /// @return boolean True if pollId exists, false if it does not.
    function checkPoll(uint256 pollId) public view returns (bool) {
        try IMACI(MACI).getPoll(pollId) {
            return true;
        } catch {
            return false;
        }
    }

    /// @dev Called by Usul to notify this strategy of a new proposal.
    /// @param data ABI encoded data including the proposalID, txHashes (not used by this strategy), and the next pollId for the MACI instance.
    /// @notice Can only be called by Usul.
    function receiveProposal(bytes memory data) external override onlyUsul {
        (uint256 proposalId, , bytes memory _pollId) = abi.decode(
            data,
            (uint256, bytes32[], bytes)
        );

        uint256 pollId = abi.decode(_pollId, (uint256));
        /// revert if pollId already exist
        if (checkPoll(pollId)) revert PollIdAlreadyExists();
        /// revert if previous pollId does not exist
        if (!checkPoll(pollId - 1)) revert PollIdIsNotNext();

        /// deploy MACI poll
        IMACI(MACI).deployPoll(
            duration,
            maxValues,
            treeDepths,
            coordinatorPubKey
        );

        /// get address of newly deployed poll
        address poll = IMACI(MACI).getPoll(pollId);

        /// map Usul proposal ID to MACI poll address
        proposals[proposalId].poll = poll;

        emit ProposalReceived(proposalId, block.timestamp);
    }

    /// @dev Finalizes the proposal, marking it as passed if option 1 (yes) received more votes than option 0 (no).
    /// @param proposalId Uint256 identifier of the proposal to be finalized.
    /// @param totalSpent Uint256 Total voice credits spent in the round, as returned in the MACI tally.
    /// @param totalSpentSalt Uint256 Total spent salt as returned in the MACI tally.
    /// @param spent Array of Uint256[] spent values, corresponding to vote options 0 and 1 from the MACI tally.
    /// @param spentProof Three dimensional uint256 array of the two dimensional uint256 arrays that make up the proofs corresponding to each vote option, as returned in the MACI tally.
    /// @param spentSalt Uint256 spent salt as returned in the MACI tally.
    /// TODO: break out this logic into a separate contract so that it can support different styles of voting.
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

    /// @dev Calls the Usul to notify that a given proposal has passed.
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

    /// @dev Sets the MACI address.
    /// @param _MACI Address of the MACI instance to be used.
    /// @notice Can only be called by owner.
    function setMACI(address _MACI) public onlyOwner {
        if (_MACI == address(0)) revert MACIAddressCannotBeZero();
        MACI = _MACI;
        emit MACIFacotrySet(MACI);
    }

    /// @dev Sets the coordinator address and pubkey.
    /// @param _coordinator Address of the coordinator.
    /// @param _coordinatorPubKey PubKey of the coordinator.
    /// @notice Can only be called by owner.
    function setCoordinator(
        address _coordinator,
        PubKey memory _coordinatorPubKey
    ) public onlyOwner {
        if (_coordinator == address(0)) revert CoordinatorAddressCannotBeZero();
        coordinator = _coordinator;
        coordinatorPubKey = _coordinatorPubKey;
        emit CoordinatorSet(coordinator, coordinatorPubKey);
    }

    /// @dev Sets the poll duration.
    /// @param _duration Uint256 duration in seconds.
    /// @notice Can only be called by owner.
    function setDuration(uint256 _duration) public onlyOwner {
        duration = _duration;
        emit DurationSet(duration);
    }

    /// @dev Sets the proposal timelock period.
    /// @param _timeLockPeriod Uint256 timeLockPeriod in seconds.
    /// @notice Can only be called by owner.
    function setTimeLockPeriod(uint256 _timeLockPeriod) public onlyOwner {
        timeLockPeriod = _timeLockPeriod;
        emit TimelockPeriodSet(timeLockPeriod);
    }

    /// @dev Sets the MACI MaxValues and TreeDepth.
    /// @param _maxValues MaxValues values to be set.
    /// @param _treeDepths TreeDepths to be set.
    /// @notice Can only be called by owner.
    function setMaxValuesAndTreeDepths(
        MaxValues memory _maxValues,
        TreeDepths memory _treeDepths
    ) public onlyOwner {
        uint8 STATE_TREE_ARITY = 5;
        uint8 MESSAGE_TREE_ARITY = 5;
        // The message batch size and the tally batch size
        BatchSizes memory batchSizes = BatchSizes(
            MESSAGE_TREE_ARITY**uint8(_treeDepths.messageTreeSubDepth),
            STATE_TREE_ARITY**uint8(_treeDepths.intStateTreeDepth),
            STATE_TREE_ARITY**uint8(_treeDepths.intStateTreeDepth)
        );
        uint256 treeArity = 5;
        if (
            !(_maxValues.maxMessages <=
                treeArity**uint256(_treeDepths.messageTreeDepth) &&
                _maxValues.maxMessages >= batchSizes.messageBatchSize &&
                _maxValues.maxMessages % batchSizes.messageBatchSize == 0 &&
                _maxValues.maxVoteOptions <=
                treeArity**uint256(_treeDepths.voteOptionTreeDepth) &&
                _maxValues.maxVoteOptions < (2**50))
        ) revert InvalidMaxValues();

        maxValues = _maxValues;
        treeDepths = _treeDepths;
        emit MaxValuesAndTreeDepthsSet(maxValues, treeDepths);
    }
}
