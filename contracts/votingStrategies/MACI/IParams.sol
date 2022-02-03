// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.8.0;

interface IParams {
    // This structs help to reduce the number of parameters to the constructor
    // and avoid a stack overflow error during compilation
    struct TreeDepths {
        uint8 intStateTreeDepth;
        uint8 messageTreeSubDepth;
        uint8 messageTreeDepth;
        uint8 voteOptionTreeDepth;
    }

    struct BatchSizes {
        uint8 messageBatchSize;
        uint8 tallyBatchSize;
    }

    struct MaxValues {
        uint256 maxMessages;
        uint256 maxVoteOptions;
    }
}
