// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "../common/VotingNFT.sol";
import "../extensions/BaseTokenVoting.sol";
import "../extensions/BaseQuorumFixed.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Usul strategy that enables compount like voting.
/// @author Nathan Ginnever - <team@hyphal.xyz>
contract NFTSingleVoting is BaseTokenVoting, BaseQuorumFixed {
    VotingNFT public governanceToken;

    mapping(uint256 => uint256) nftVoted; // mapping proposal id to nft id to bool

    constructor(
        address _owner,
        VotingNFT _governanceToken,
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
            VotingNFT _governanceToken,
            address _UsulModule,
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
        UsulModule = _UsulModule;
        timeLockPeriod = _timeLockPeriod * 1 seconds;
        name = name_;
        emit StrategySetup(_UsulModule, _owner);
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

    //todo: use percentage based on total supply
    function quorum() public view override returns (uint256) {
        return quorumThreshold();
    }

    function calculateWeight(address delegatee, uint256 proposalId)
        public
        view
        override
        returns (uint256)
    {
        require(
            governanceToken.getPastVotes(
                delegatee,
                proposals[proposalId].startBlock
            ) > 0
        );
        return 1;
    }
}
