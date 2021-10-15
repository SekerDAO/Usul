// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./BaseTokenVoting.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Seele strategy that enables compount like voting.
/// @author Nathan Ginnever - <team@tokenwalk.org>
contract NFTSingleVoting is BaseTokenVoting {

    IERC721 public immutable governanceToken;

    constructor(
        uint256 _votingPeriod,
        IERC721 _governanceToken,
        address _seeleModule,
        uint256 _quorumThreshold,
        uint256 _timeLockPeriod,
        address _owner,
        string memory name_
    ) BaseTokenVoting(
        _votingPeriod,
        _seeleModule,
        _quorumThreshold,
        _timeLockPeriod,
        _owner,
        name_
    ) {
        require(_governanceToken != IERC721(address(0)), "invalid governance token address");
        governanceToken = _governanceToken;
    }


    function calculateWeight(address voter, uint256 proposalId) public override view returns (uint256) {
        require(governanceToken.balanceOf(voter) >= 1, "voter must own an NFT");
        return 1;
    }
}
