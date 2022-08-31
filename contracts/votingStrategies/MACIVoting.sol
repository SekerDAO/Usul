// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "../extensions/BaseMember.sol";
import "./MACI/IMACI.sol";
import "./MACI/IParams.sol";
import "./MACI/IPubKey.sol";

struct Proposal {
    uint256 maciPollId;
    bool finalized;
}

/// @title MACI Voting - A Usul strategy that enables secret voting using MACI.
/// @author Nathan Ginnever - <team@hyphal.xyz> & Auryn Macmillan - <auryn.macmillan@gnosis.io>
abstract contract MACIVoting is BaseMember, IPubKey, IParams {
    address public coordinator;
    address public MACI;
    address public messageAqFactory;
    address public VkRegistry;

    PubKey public coordinatorPubKey;

    uint256 public duration;
    uint256 internal nextPollId = 0;

    mapping(uint256 => Proposal) public proposals;
    mapping(address => bool) public registered;

    MaxValues public maxValues;
    TreeDepths public treeDepths;

    event MACIFacotrySet(address MACIFactory);
    event ProposalReceived(uint256 proposalId, uint256 timestamp);
    event MemberRegistered(address member);

    // Can only be called by MACI.
    error NotMACI(address sender);
    // `member` has already registered.
    error AlreadyRegistered(address member);
    // Address is not a member.
    error NotMember(address member);
    // Can only be called by coordinator.
    error NotCoordinator(address sender);

    modifier onlyMACI() {
        if (msg.sender != MACI) revert NotMACI(msg.sender);
        _;
    }

    modifier onlyCoordinator() {
        if (msg.sender != coordinator) revert NotCoordinator(msg.sender);
        _;
    }

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

    /// @dev Called by the proposal module, this notifes the strategy of a new proposal.
    /// @param data any extra data to pass to the voting strategy
    function receiveProposal(bytes memory data)
        external
        virtual
        override
        onlyUsul
    {
        (uint256 proposalId, , ) = abi.decode(
            data,
            (uint256, bytes32[], bytes)
        );

        // map Usul proposal ID to MACI proposal ID
        proposals[proposalId].maciPollId = nextPollId;

        // deploy MACI poll
        IMACI(MACI).deployPoll(
            duration,
            maxValues,
            treeDepths,
            coordinatorPubKey
        );

        nextPollId++;

        emit ProposalReceived(proposalId, block.timestamp);
    }

    function finalizeProposal(
        uint256 proposalId,
        uint256 _totalSpent,
        uint256 _totalSpentSalt,
        uint256[] memory spent,
        uint256[][][] calldata _spentProof,
        uint256 _spentSalt
    ) public {
        Proposal memory proposal = proposals[proposalId];
        address maciPollId = IMACI(MACI).getPoll(proposal.maciPollId);
    }

    /// @dev Determines if a proposal has succeeded.
    /// @param proposalId the proposal to vote for.
    /// @return boolean.
    function isPassed(uint256 proposalId) public view override returns (bool) {}

    /// @dev Sets the MACI
    /// @param _MACI Address of the deployed MACI instance this
    function setMACI(address _MACI) public onlyOwner {
        MACI = _MACI;
        emit MACIFacotrySet(MACI);
    }
}
