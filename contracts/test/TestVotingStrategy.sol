// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.6;

import "../interfaces/IProposal.sol";

contract TestVotingStrategy {
    address public seeleModule;

    constructor(address _seeleModule) {
        seeleModule = _seeleModule;
    }

    function finalizeVote(uint256 proposalId) public {
        IProposal(seeleModule).receiveStrategy(proposalId);
    }

    function receiveProposal(uint256 proposalId, bytes memory data) public {}
}
