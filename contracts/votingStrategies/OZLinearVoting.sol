// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "./BaseTokenVoting.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Seele strategy that enables compound like voting.
/// @author Nathan Ginnever - <team@hyphal.xyz>
contract OZLinearVoting is BaseTokenVoting {
    ERC20Votes public immutable governanceToken;

    constructor(
        uint256 _votingPeriod,
        ERC20Votes _governanceToken,
        address _seeleModule,
        uint256 _quorumThreshold,
        uint256 _timeLockPeriod,
        address _owner,
        string memory name_
    )
        BaseTokenVoting(
            _votingPeriod,
            _seeleModule,
            _quorumThreshold,
            _timeLockPeriod,
            _owner,
            name_
        )
    {
        require(
            _governanceToken != ERC20Votes(address(0)),
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
