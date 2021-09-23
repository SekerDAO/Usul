// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.0;

interface IProposal {
    function receiveVote(
        address voter,
        uint256 proposalId,
        uint8 vote,
        uint256 weight
    ) external;

    function getProposalStart(uint256 proposalId)
        external
        view
        returns (uint256);

    function getProposalWindow() external view returns (uint256);
}
