// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.6;

import "../interfaces/IProposal.sol";

contract TestStrategy {
    address public UsulModule;
    uint256 public timeLockPeriod;

    constructor(address _UsulModule, uint256 _timeLockedPeriod) {
        UsulModule = _UsulModule;
        timeLockPeriod = _timeLockedPeriod;
    }

    function finalizeStrategy(uint256 proposalId) public {
        IProposal(UsulModule).receiveStrategy(proposalId, timeLockPeriod);
    }

    function receiveProposal(bytes memory data) public {}
}
