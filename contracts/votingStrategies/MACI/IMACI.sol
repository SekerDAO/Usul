// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.0;

import "./IParams.sol";
import "./IPubKey.sol";

interface IMACI is IPubKey, IParams {
    function deployPoll(
        uint256 _duration,
        MaxValues memory _maxValues,
        TreeDepths memory _treeDepths,
        PubKey memory _coordinatorPubKey
    ) external;

    function getPoll(uint256 _pollId) external view returns (address);

    function stateTreeDepth() external view returns (uint8);

    function vkRegistry() external view returns (address);

    function getStateAqRoot() external view returns (uint256);

    function mergeStateAqSubRoots(uint256 _numSrQueueOps, uint256 _pollId)
        external;

    function mergeStateAq(uint256 _pollId) external returns (uint256);

    function numSignUps() external view returns (uint256);

    function stateAq() external view returns (address);

    function init(address _vkRegistry, address _messageAqFactory) external;
}
