// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "../BaseStrategy.sol";

/// @title Proposal guardStrategy - A by role allowed to only cancel proposals.
/// @author Nathan Ginnever - <team@tokenwalk.org>
contract ProposalGuard is BaseStrategy {
    mapping(address => bool) public allowedGuards;
    mapping(uint256 => bool) public checkedProposals;
    bytes4 public immutable cancelSignature =
        bytes4(keccak256("cancelProposal(uint256)")); // 0xe0a8f6f5

    event EnabledGuard(address guard);
    event DisabledGuard(address guard);

    constructor(
        address[] memory _guards,
        address _owner,
        address _seele
    ) {
        seeleModule = _seele;
        transferOwnership(_owner);
        for (uint256 i = 0; i < _guards.length; i++) {
            enableGuard(_guards[i]);
        }
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
    function receiveProposal(bytes memory data) external override {
        (
            uint256 proposalId,
            bytes32[] memory txHashes,
            bytes memory txData
        ) = abi.decode(data, (uint256, bytes32[], bytes));
        //require(target == seeleModule);
        require(
            txHashes[0] == keccak256(txData),
            "supplied calldata does not match proposal hash"
        );
        require(
            bytes4(txData) == cancelSignature,
            "proposal is not a cancel signature"
        );
        checkedProposals[proposalId] = true;
    }

    function finalizeVote(uint256 proposalId) public override {
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
}
