// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.6;

interface IProposal {
    function receiveProposal(uint256 proposalId) external;

    function startTimeLock(uint256 proposalId) external;
}
