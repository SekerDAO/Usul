// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "../common/VotingNFT.sol";
import "../extensions/BaseTokenVoting.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Seele strategy that enables compount like voting.
/// @author Nathan Ginnever - <team@hyphal.xyz>
contract NFTLinearVoting is BaseTokenVoting {
    VotingNFT public governanceToken;

    constructor(
        address _owner,
        VotingNFT _governanceToken,
        address _seeleModule,
        uint256 _votingPeriod,
        uint256 _quorumThreshold,
        uint256 _timeLockPeriod,
        string memory name_
    ) {
        bytes memory initParams = abi.encode(
            _owner,
            _governanceToken,
            _seeleModule,
            _votingPeriod,
            _quorumThreshold,
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
            uint256 _quorumThreshold,
            uint256 _timeLockPeriod,
            string memory name_
        ) = abi.decode(
                initParams,
                (address, VotingNFT, address, uint256, uint256, uint256, string)
            );
        require(_votingPeriod > 1, "votingPeriod must be greater than 1");
        require(_seeleModule != address(0), "invalid seele module");
        require(_quorumThreshold > 0, "threshold must ne non-zero");
        require(
            _governanceToken != VotingNFT(address(0)),
            "invalid governance token address"
        );
        governanceToken = _governanceToken;
        __Ownable_init();
        __EIP712_init_unchained(name_, version());
        transferOwnership(_owner);
        votingPeriod = _votingPeriod * 1 seconds; // switch to hours in prod
        seeleModule = _seeleModule;
        quorumThreshold = _quorumThreshold;
        timeLockPeriod = _timeLockPeriod * 1 seconds;
        emit StrategySetup(_seeleModule, _owner);
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
