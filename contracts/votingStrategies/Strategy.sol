// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "../interfaces/IProposal.sol";

abstract contract Strategy {
    address public seeleModule;
    address public avatar;

    modifier onlyAvatar() {
        require(msg.sender == avatar, "only avatar may enter");
        _;
    }

    modifier onlySeele() {
        require(msg.sender == seeleModule, "only seele module may enter");
        _;
    }

    /// @dev Sets the executor to a new account (`newExecutor`).
    /// @notice Can only be called by the current owner.
    function setAvatar(address _avatar) public onlyAvatar {
        avatar = _avatar;
    }

    /// @dev Sets the executor to a new account (`newExecutor`).
    /// @notice Can only be called by the current owner.
    function setSeele(address _seele) public onlyAvatar {
        seeleModule = _seele;
    }

    /// @dev Called by the proposal module, this notifes the strategy of a new proposal.
    /// @param data any extra data to pass to the voting strategy
    function receiveProposal(bytes memory data)
        external
        virtual;

    /// @dev Calls the proposal module to notify that a quorum has been reached.
    /// @param proposalId the proposal to vote for.
    function finalizeVote(uint256 proposalId) public virtual;

    /// @dev Determines if a proposal has succeeded.
    /// @param proposalId the proposal to vote for.
    /// @return boolean.
    function isPassed(uint256 proposalId) public view virtual returns (bool);
}
