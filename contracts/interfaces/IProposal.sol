// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.0;

interface IProposal {
    function receiveVote(
        address voter,
        uint256 proposalId,
        bool vote,
        uint256 weight
    ) external;
}
