// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.6;

import "../interfaces/IProposal.sol";

contract TestVotingStrategy {
    address public seeleModule;
    uint256 public timeLockPeriod;

    constructor(address _seeleModule, uint256 _timeLockedPeriod) {
        seeleModule = _seeleModule;
        timeLockPeriod = _timeLockedPeriod;
    }

    function finalizeVote(uint256 proposalId) public {
        IProposal(seeleModule).receiveStrategy(proposalId, timeLockPeriod);
    }

    function receiveProposal(uint256 proposalId, bytes memory data) public {}
}
