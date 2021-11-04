// SPDX-License-Identifier: LGPL-3.0-only
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

pragma solidity >=0.8.0;

/// @title BaseQuorumThreshold - A Seele strategy extension that enables threshold based quorums.
/// @author Nathan Ginnever - <team@hyphal.xyz>
abstract contract BaseQuorumFixed is OwnableUpgradeable {
    uint256 private _quorumThreshold;

    event QuorumThresholdUpdated(
        uint256 oldQuorumThreshold,
        uint256 newQuorumThreshold
    );

    function quorumThreshold() public view returns (uint256) {
        return _quorumThreshold;
    }

    function quorum() public view virtual returns (uint256);

    function updateQuorumThreshold(uint256 newQuorumThreshold)
        public
        onlyOwner
    {
        _updateQuorumThreshold(newQuorumThreshold);
    }

    function _updateQuorumThreshold(uint256 newQuorumThreshold) internal {
        uint256 oldQuorumThreshold = _quorumThreshold;
        _quorumThreshold = newQuorumThreshold;

        emit QuorumThresholdUpdated(oldQuorumThreshold, newQuorumThreshold);
    }
}
