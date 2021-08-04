// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.0;

import "../common/Enum.sol";

interface ISafe {
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation
    ) external returns (bool success);
}
