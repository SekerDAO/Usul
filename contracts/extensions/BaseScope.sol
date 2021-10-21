// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "../BaseStrategy.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";

/// @title Base scope - A Seele strategy extension that scopes execution of proposals.
/// @author Nathan Ginnever - <team@hyphal.xyz>
abstract contract BaseScope is BaseStrategy {
    bytes32 public constant DOMAIN_SEPARATOR_TYPEHASH =
        0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;
    // keccak256(
    //     "EIP712Domain(uint256 chainId,address verifyingContract)"
    // );

    bytes32 public constant TRANSACTION_TYPEHASH =
        0x72e9670a7ee00f5fbf1049b8c38e3f22fab7e9b85029e85cf9412f17fdd5c2ad;
    // keccak256(
    //     "Transaction(address to,uint256 value,bytes data,uint8 operation,uint256 nonce)"
    // );

    mapping(uint256 => bool[]) public checkedProposals;
    bytes4 public allowedSignature;
    //bytes4(keccak256("cancelProposals(uint256[])")); // 0xe0a8f6f5
    address public allowedTarget;

    event SignatureSet(
        bytes4 indexed previousSignature,
        bytes4 indexed newSignature
    );
    event TargetSet(address indexed previousTarget, address indexed newTarget);

    function updateAllowedSignature(bytes4 _newSignature) public onlyOwner {
        bytes4 previousSignature = allowedSignature;
        allowedSignature = _newSignature;
        emit SignatureSet(previousSignature, _newSignature);
    }

    function updateAllowedTarget(address _newTarget) public onlyOwner {
        address previousTarget = allowedTarget;
        allowedTarget = _newTarget;
        emit TargetSet(previousTarget, _newTarget);
    }

    function checkTransaction(
        uint256 proposalId,
        bytes32 txHash,
        bytes memory _tx
    ) internal virtual {
        (
            address target,
            uint256 value,
            bytes memory txData,
            Enum.Operation operation
        ) = abi.decode(_tx, (address, uint256, bytes, Enum.Operation));
        require(target == allowedTarget, "only calls to allowedTarget");
        require(
            txHash ==
                keccak256(
                    generateTransactionHashData(
                        target,
                        value,
                        txData,
                        operation,
                        0
                    )
                ),
            "supplied calldata does not match proposal hash"
        );
        require(
            bytes4(txData) == allowedSignature,
            "proposal is not a cancel signature"
        );
        checkedProposals[proposalId].push(true);
    }

    /// @dev Generates the data for the module transaction hash (required for signing)
    function generateTransactionHashData(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 nonce
    ) internal view returns (bytes memory) {
        uint256 chainId = getChainId();
        bytes32 domainSeparator = keccak256(
            abi.encode(DOMAIN_SEPARATOR_TYPEHASH, chainId, seeleModule) // use seele as the verifying contract
        );
        bytes32 transactionHash = keccak256(
            abi.encode(
                TRANSACTION_TYPEHASH,
                to,
                value,
                keccak256(data),
                operation,
                nonce
            )
        );
        return
            abi.encodePacked(
                bytes1(0x19),
                bytes1(0x01),
                domainSeparator,
                transactionHash
            );
    }

    /// @dev Returns the chain id used by this contract.
    function getChainId() public view returns (uint256) {
        uint256 id;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            id := chainid()
        }
        return id;
    }
}
