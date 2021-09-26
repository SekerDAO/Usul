// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.6;

interface IStrategy
 {
    function calculateWeight(address delegatee) external view returns (uint256);

    function startVoting(address delegatee) external;

    function checkBlock(address delegatee) external view returns (bool);

    function getThreshold() external view returns (uint256);

    function receiveProposal(uint256 proposalId) external;
}
