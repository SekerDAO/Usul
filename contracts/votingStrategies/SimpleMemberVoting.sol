// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "../extensions/BaseTokenVoting.sol";
import "../extensions/BaseMember.sol";
import "../extensions/BaseQuorumPercent.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Usul strategy that enables compount like voting.
/// @author Nathan Ginnever - <team@hyphal.xyz>
contract SimpleMemberVoting is BaseTokenVoting, BaseMember, BaseQuorumPercent {
    constructor(
        address _owner,
        address _UsulModule,
        uint256 _votingPeriod,
        uint256 quorumNumerator_,
        uint256 _timeLockPeriod,
        string memory name_,
        address[] memory _members
    ) {
        bytes memory initParams = abi.encode(
            _owner,
            _UsulModule,
            _votingPeriod,
            quorumNumerator_,
            _timeLockPeriod,
            name_,
            _members
        );
        setUp(initParams);
    }

    function setUp(bytes memory initParams) public override initializer {
        (
            address _owner,
            address _UsulModule,
            uint256 _votingPeriod,
            uint256 quorumNumerator_,
            uint256 _timeLockPeriod,
            string memory name_,
            address[] memory _members
        ) = abi.decode(
                initParams,
                (address, address, uint256, uint256, uint256, string, address[])
            );
        require(_votingPeriod > 1, "votingPeriod must be greater than 1");
        __Ownable_init();
        for (uint256 i = 0; i < _members.length; i++) {
            addMember(_members[i]);
        }
        __EIP712_init_unchained(name_, version());
        updateQuorumNumerator(quorumNumerator_);
        transferOwnership(_owner);
        votingPeriod = _votingPeriod * 1 seconds; // switch to hours in prod
        UsulModule = _UsulModule;
        timeLockPeriod = _timeLockPeriod * 1 seconds;
        name = name_;
        emit StrategySetup(_UsulModule, _owner);
    }

    /// @dev Submits a vote for a proposal.
    /// @param proposalId the proposal to vote for.
    /// @param support against, for, or abstain.
    function vote(
        uint256 proposalId,
        uint8 support,
        bytes memory
    ) external {
        _vote(
            proposalId,
            msg.sender,
            support,
            calculateWeight(msg.sender, proposalId)
        );
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
    ) external {
        address voter = ECDSA.recover(
            _hashTypedDataV4(
                keccak256(abi.encode(VOTE_TYPEHASH, proposalId, support))
            ),
            signature
        );
        _vote(proposalId, voter, support, calculateWeight(voter, proposalId));
    }

    /// @dev Determines if a proposal has succeeded.
    /// @param proposalId the proposal to vote for.
    /// @return boolean.
    function isPassed(uint256 proposalId) public view override returns (bool) {
        require(
            proposals[proposalId].yesVotes > proposals[proposalId].noVotes,
            "majority yesVotes not reached"
        );
        require(
            proposals[proposalId].yesVotes +
                proposals[proposalId].abstainVotes >=
                quorum(block.number),
            "a quorum has not been reached for the proposal"
        );
        require(
            proposals[proposalId].deadline < block.timestamp,
            "voting period has not passed yet"
        );
        return true;
    }

    function quorum(uint256) public view override returns (uint256) {
        return (memberCount * quorumNumerator()) / quorumDenominator();
    }

    function calculateWeight(address voter, uint256)
        public
        view
        onlyMember(voter)
        returns (uint256)
    {
        return 1;
    }
}
