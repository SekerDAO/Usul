// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "./IPubKey.sol";

interface IMACIFactory is IPubKey {
    function setMaciParameters(
        uint8 _stateTreeDepth,
        uint8 _messageTreeDepth,
        uint8 _voteOptionTreeDepth,
        uint8 _tallyBatchSize,
        uint8 _messageBatchSize,
        address _batchUstVerifier, // outdated
        address _qvtVerifier, // outdated
        uint256 _signUpDuration,
        uint256 _votingDuration
    ) external;

    function deployMaci(
        address _signUpGatekeeper,
        address _initialVoiceCreditProxy,
        address _coordinator,
        PubKey calldata _coordinatorPubKey
    ) external returns (address _maci);
}
