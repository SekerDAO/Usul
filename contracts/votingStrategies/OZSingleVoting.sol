// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "../extensions/BaseTokenVoting.sol";
import "../extensions/BaseQuorumFixed.sol";

/// @title OpenZeppelin Single Voting Strategy - A Usul strategy that enables compound like voting.
/// @author Nathan Ginnever - <team@hyphal.xyz>
contract OZSingleVoting is BaseTokenVoting, BaseQuorumFixed {
    ERC20Votes public governanceToken;

    constructor(
        address _owner,
        ERC20Votes _governanceToken,
        address _UsulModule,
        uint256 _votingPeriod,
        uint256 quorumThreshold_,
        uint256 _timeLockPeriod,
        string memory name_
    ) {
        bytes memory initParams = abi.encode(
            _owner,
            _governanceToken,
            _UsulModule,
            _votingPeriod,
            quorumThreshold_,
            _timeLockPeriod,
            name_
        );
        setUp(initParams);
    }

    function setUp(bytes memory initParams) public override initializer {
        (
            address _owner,
            ERC20Votes _governanceToken,
            address _UsulModule,
            uint256 _votingPeriod,
            uint256 quorumThreshold_,
            uint256 _timeLockPeriod,
            string memory name_
        ) = abi.decode(
                initParams,
                (
                    address,
                    ERC20Votes,
                    address,
                    uint256,
                    uint256,
                    uint256,
                    string
                )
            );
        require(_votingPeriod > 1, "votingPeriod must be greater than 1");
        require(_UsulModule != address(0), "invalid Usul module");
        require(quorumThreshold_ > 0, "threshold must ne non-zero");
        require(
            _governanceToken != ERC20Votes(address(0)),
            "invalid governance token address"
        );
        governanceToken = _governanceToken;
        __Ownable_init();
        __EIP712_init_unchained(name_, version());
        updateQuorumThreshold(quorumThreshold_);
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
                quorum(),
            "a quorum has not been reached for the proposal"
        );
        require(
            proposals[proposalId].deadline < block.timestamp,
            "voting period has not passed yet"
        );
        return true;
    }

    function quorum() public view override returns (uint256) {
        return quorumThreshold();
    }

    function calculateWeight(address delegatee, uint256 proposalId)
        public
        view
        returns (uint256)
    {
        require(
            governanceToken.getPastVotes(
                delegatee,
                proposals[proposalId].startBlock
            ) > 0,
            "voter does not hold any ERC20 tokens"
        );
        return 1;
    }
}
