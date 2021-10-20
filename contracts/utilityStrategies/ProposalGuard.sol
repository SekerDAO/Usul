// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "../BaseStrategy.sol";
import "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";

/// @title Proposal guardStrategy - A by role allowed to only cancel proposals.
/// @author Nathan Ginnever - <team@tokenwalk.org>
contract ProposalGuard is BaseStrategy {
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

    mapping(address => bool) public allowedGuards;
    mapping(uint256 => bool) public checkedProposals;
    bytes4 public immutable cancelSignature =
        bytes4(keccak256("cancelProposals(uint256[])")); // 0xe0a8f6f5

    event EnabledGuard(address guard);
    event DisabledGuard(address guard);

    constructor(
        address[] memory _guards,
        address _owner,
        address _seele
    ) {
        bytes memory initParams = abi.encode(_guards, _owner, _seele);
        setUp(initParams);
    }

    function setUp(bytes memory initParams) public override initializer {
        (address[] memory _guards, address _owner, address _seele) = abi.decode(
            initParams,
            (address[], address, address)
        );
        seeleModule = _seele;
        __Ownable_init();
        for (uint256 i = 0; i < _guards.length; i++) {
            enableGuard(_guards[i]);
        }
        transferOwnership(_owner);
        emit StrategySetup(_seele, _owner);
    }

    /// @dev Disables a guard
    /// @param _guard Guard to be removed
    /// @notice This can only be called by the owner
    function disableGuard(address _guard) public onlyOwner {
        require(_guard != address(0), "Invalid guard");
        require(allowedGuards[_guard] != false, "Guard already disabled");
        allowedGuards[_guard] = false;
        emit DisabledGuard(_guard);
    }

    /// @dev Enables a guard
    /// @param _guard Guard to be added
    /// @notice This can only be called by the owner
    function enableGuard(address _guard) public onlyOwner {
        require(_guard != address(0), "Invalid guard");
        require(allowedGuards[_guard] == false, "Guard already enabled");
        allowedGuards[_guard] = true;
        emit EnabledGuard(_guard);
    }

    /// @dev receives a cancel proposal bypass proposal
    /// @param data extra data for proposal guard
    /// @notice This data contains the call to cancel a proposal. It must match the hash
    /// of the transaction and the function selector must only be a cancelProposal call.
    function receiveProposal(bytes memory data) external override onlySeele {
        (
            uint256 proposalId,
            bytes32[] memory txHash,
            bytes memory extraData
        ) = abi.decode(data, (uint256, bytes32[], bytes));
        (
            address target,
            uint256 value,
            bytes memory txData,
            Enum.Operation operation
        ) = abi.decode(extraData, (address, uint256, bytes, Enum.Operation));
        require(target == seeleModule, "only calls to seele core");
        require(
            txHash[0] ==
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
            bytes4(txData) == cancelSignature,
            "proposal is not a cancel signature"
        );
        checkedProposals[proposalId] = true;
    }

    function finalizeStrategy(uint256 proposalId) public override {
        require(
            allowedGuards[msg.sender] == true,
            "cannot finalize guard proposal"
        );
        if (isPassed(proposalId)) {
            IProposal(seeleModule).receiveStrategy(proposalId, 0);
        }
    }

    function isPassed(uint256 proposalId) public view override returns (bool) {
        return checkedProposals[proposalId];
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
