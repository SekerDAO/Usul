// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.0;

interface IVoting {
    function calculateWeight(address delegatee) external view returns (uint256);
    function startVoting(address delegatee) external;
    function checkBlock(address delegatee) external view returns (bool);
}
