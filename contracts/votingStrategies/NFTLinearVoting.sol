// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "../test/TestNFT.sol";
import "./BaseTokenVoting.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Seele strategy that enables compount like voting.
/// @author Nathan Ginnever - <team@tokenwalk.org>
contract NFTLinearVoting is BaseTokenVoting {
    TestNFT public immutable governanceToken;

    constructor(
        address _owner,
        TestNFT _governanceToken,
        address _seeleModule,
        uint256 _quorumThreshold,
        uint256 _timeLockPeriod,
        uint256 _votingPeriod,
        string memory name_
    )
        BaseTokenVoting(
            _owner,
            _seeleModule,
            _votingPeriod,
            _quorumThreshold,
            _timeLockPeriod,
            name_
        )
    {
        require(
            _governanceToken != TestNFT(address(0)),
            "invalid governance token address"
        );
        governanceToken = _governanceToken;
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
