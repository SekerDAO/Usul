// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "../extensions/BaseTokenVoting.sol";
import "../extensions/BaseQuorumPercent.sol";
import "../extensions/BaseMember.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Usul strategy that enables compount like voting.
/// @author Nathan Ginnever - <team@hyphal.xyz>
contract MemberNFTSingleVoting is
    BaseTokenVoting,
    BaseMember,
    BaseQuorumPercent
{
    IERC721 public tokenAddress;
    mapping(uint256 => mapping(uint256 => bool)) idHasVoted; // map proposalId to nft ids to hasBeenUsed

    constructor(
        address _owner,
        IERC721 _governanceToken,
        address _UsulModule,
        uint256 _votingPeriod,
        uint256 quorumThreshold_,
        uint256 _timeLockPeriod,
        string memory name_,
        address[] memory _members
    ) {
        bytes memory initParams = abi.encode(
            _owner,
            _governanceToken,
            _UsulModule,
            _votingPeriod,
            quorumThreshold_,
            _timeLockPeriod,
            name_,
            _members
        );
        setUp(initParams);
    }

    function setUp(bytes memory initParams) public override initializer {
        (
            address _owner,
            IERC721 _governanceToken,
            address _UsulModule,
            uint256 _votingPeriod,
            uint256 quorumNumerator_,
            uint256 _timeLockPeriod,
            string memory name_,
            address[] memory _members
        ) = abi.decode(
                initParams,
                (
                    address,
                    IERC721,
                    address,
                    uint256,
                    uint256,
                    uint256,
                    string,
                    address[]
                )
            );
        require(_votingPeriod > 1, "votingPeriod must be greater than 1");
        require(
            _governanceToken != IERC721(address(0)),
            "invalid governance token address"
        );
        tokenAddress = _governanceToken;
        __Ownable_init();
        for (uint256 i = 0; i < _members.length; i++) {
            addMember(_members[i]);
        }
        __EIP712_init_unchained(name_, version());
        _updateQuorumNumerator(quorumNumerator_);
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
        bytes memory extraData
    ) external onlyMember(msg.sender) {
        uint256 id = abi.decode(extraData, (uint256));
        checkPreviousVote(id, proposalId, msg.sender);
        _vote(proposalId, msg.sender, support, 1);
    }

    /// @dev Submits a vote for a proposal by ERC712 signature.
    /// @param proposalId the proposal to vote for.
    /// @param support against, for, or abstain.
    /// @param signature 712 signed vote
    function voteSignature(
        uint256 proposalId,
        uint8 support,
        bytes memory signature,
        bytes memory extraData
    ) external {
        address voter = ECDSA.recover(
            _hashTypedDataV4(
                keccak256(
                    abi.encode(VOTE_TYPEHASH, proposalId, support, extraData)
                )
            ),
            signature
        );
        require(members[voter], "voter is not a member");
        uint256 id = abi.decode(extraData, (uint256));
        checkPreviousVote(id, proposalId, voter);
        _vote(proposalId, voter, support, 1);
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

    function checkPreviousVote(
        uint256 id,
        uint256 proposalId,
        address voter
    ) internal {
        require(
            idHasVoted[proposalId][id] == false,
            "no weight, contains an id that has already voted"
        );
        idHasVoted[proposalId][id] = true;
        require(tokenAddress.ownerOf(id) == voter, "voter does not own an id");
    }
}
