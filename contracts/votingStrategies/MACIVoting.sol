// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "../extensions/BaseMember.sol";
import "./MACI/IMACI.sol";
import "./MACI/IMACIFactory.sol";
import "./MACI/IParams.sol";
import "./MACI/IPubKey.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// contract MessageAqFactory is Ownable {
//     function deploy(uint256 _subDepth) public onlyOwner returns (AccQueue) {
//         AccQueue aq = new AccQueueQuinaryMaci(_subDepth);
//         aq.transferOwnership(owner());
//         return aq;
//     }
// }

/// @title MACI Voting - A Usul strategy that enables secret voting using MACI.
/// @author Nathan Ginnever - <team@hyphal.xyz> & Auryn Macmillan - <auryn.macmillan@gnosis.io>
abstract contract MACIVoting is BaseMember, IPubKey, IParams {
    struct MACIDeployments {
        address add; // address of the MACI deployement.
        mapping(address => bool) registeredVoters; // whether or not voter has already registered.
    }

    address public coordinator;
    address public MACIFactory;
    address public messageAqFactory;
    address public VkRegistry;

    PubKey public coordinatorPubKey;

    uint256 public duration;

    MaxValues public maxValues;
    TreeDepths public treeDepths;

    mapping(uint256 => MACIDeployments) public MaciDeployments;

    event MACIFacotrySet(address MACIFactory);
    event ProposalReceived(uint256 proposalId, uint256 timestamp);

    /// `sender` is not MACI.
    error NotMACI(address sender);

    /// `member` has already registered.
    error AlreadyRegistered(address member);

    /// @dev Acts as signup gatekeeper for MACI.
    function register(address _member, bytes memory _data) public {
        uint256 proposalId = abi.decode(_data, (uint256));
        if (msg.sender != MaciDeployments[proposalId].add)
            revert NotMACI(msg.sender);
        if (MaciDeployments[proposalId].registeredVoters[_member])
            revert AlreadyRegistered(_member);
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

        // deploy MACI
        MaciDeployments[proposalId].add = IMACIFactory(MACIFactory).deployMaci(
            address(this),
            address(this),
            coordinator,
            coordinatorPubKey
        );
        // initialize MACI
        IMACI(MaciDeployments[proposalId].add).init(
            VkRegistry,
            messageAqFactory
        );
        // deploy poll
        IMACI(MaciDeployments[proposalId].add).deployPoll(
            duration,
            maxValues,
            treeDepths,
            coordinatorPubKey
        );
        emit ProposalReceived(proposalId, block.timestamp);
    }

    function getVoiceCredits(address _user, bytes memory _data)
        public
        pure
        returns (uint256)
    {
        return 1;
    }

    /// @dev Determines if a proposal has succeeded.
    /// @param proposalId the proposal to vote for.
    /// @return boolean.
    function isPassed(uint256 proposalId) public view override returns (bool) {}

    /// @dev Sets the MACIFactory
    /// @param _MACIFactory Address of the deployed MACI instance this
    function setMACIFactory(address _MACIFactory) public onlyOwner {
        MACIFactory = _MACIFactory;
        emit MACIFacotrySet(MACIFactory);
    }
}
