// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.6;

interface IStrategy {
    function receiveProposal(uint256 proposalId, bytes memory data) external;
}
