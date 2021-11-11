// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "./interfaces/IProposal.sol";
import "./common/FactoryFriendly.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

abstract contract BaseStrategy is OwnableUpgradeable, FactoryFriendly {
    /// @dev Emitted each time the avatar is set.
    event UsulSet(address indexed previousUsul, address indexed newUsul);
    event StrategySetup(address indexed UsulModule, address indexed owner);

    address public UsulModule;

    modifier onlyUsul() {
        require(msg.sender == UsulModule, "only Usul module may enter");
        _;
    }

    /// @dev Sets the executor to a new account (`newExecutor`).
    /// @notice Can only be called by the current owner.
    function setUsul(address _Usul) public onlyOwner {
        address previousUsul = UsulModule;
        UsulModule = _Usul;
        emit UsulSet(previousUsul, _Usul);
    }

    /// @dev Called by the proposal module, this notifes the strategy of a new proposal.
    /// @param data any extra data to pass to the voting strategy
    function receiveProposal(bytes memory data) external virtual;

    /// @dev Calls the proposal module to notify that a quorum has been reached.
    /// @param proposalId the proposal to vote for.
    function finalizeStrategy(uint256 proposalId) external virtual;

    /// @dev Determines if a proposal has succeeded.
    /// @param proposalId the proposal to vote for.
    /// @return boolean.
    function isPassed(uint256 proposalId) public view virtual returns (bool);
}
