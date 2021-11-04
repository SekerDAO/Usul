// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "../common/VotingNFT.sol";
import "../extensions/BaseTokenVoting.sol";
import "../extensions/BaseQuorumFixed.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Seele strategy that enables compount like voting.
/// @author Nathan Ginnever - <team@hyphal.xyz>
contract NFTLinearVoting is BaseTokenVoting, BaseQuorumFixed {
    VotingNFT public governanceToken;

    constructor(
        address _owner,
        VotingNFT _governanceToken,
        address _seeleModule,
        uint256 _votingPeriod,
        uint256 quorumThreshold_,
        uint256 _timeLockPeriod,
        string memory name_
    ) {
        bytes memory initParams = abi.encode(
            _owner,
            _governanceToken,
            _seeleModule,
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
            VotingNFT _governanceToken,
            address _seeleModule,
            uint256 _votingPeriod,
            uint256 quorumThreshold_,
            uint256 _timeLockPeriod,
            string memory name_
        ) = abi.decode(
                initParams,
                (address, VotingNFT, address, uint256, uint256, uint256, string)
            );
        require(_votingPeriod > 1, "votingPeriod must be greater than 1");
        require(
            _governanceToken != VotingNFT(address(0)),
            "invalid governance token address"
        );
        governanceToken = _governanceToken;
        __Ownable_init();
        __EIP712_init_unchained(name_, version());
        updateQuorumThreshold(quorumThreshold_);
        transferOwnership(_owner);
        votingPeriod = _votingPeriod * 1 seconds; // switch to hours in prod
        seeleModule = _seeleModule;
        timeLockPeriod = _timeLockPeriod * 1 seconds;
        name = name_;
        emit StrategySetup(_seeleModule, _owner);
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
        override
        returns (uint256)
    {
        return
            governanceToken.getPastVotes(
                delegatee,
                proposals[proposalId].startBlock
            );
    }
}
