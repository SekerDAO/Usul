// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.0;

interface IVoting {
    function calculateWeight(address delegatee) external view returns (uint);
    function startVoting(address delegatee) external;
    function endVoting(address delegatee) external;
}