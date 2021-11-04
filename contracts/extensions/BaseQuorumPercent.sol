// SPDX-License-Identifier: LGPL-3.0-only
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

pragma solidity >=0.8.0;


/// @title BaseQuorumPercent - A Seele strategy extension that enables percent based quorums.
/// @author Nathan Ginnever - <team@hyphal.xyz>
abstract contract BaseQuorumPercent is OwnableUpgradeable {

    uint256 private _quorumNumerator;

    event QuorumNumeratorUpdated(uint256 oldQuorumNumerator, uint256 newQuorumNumerator);

    function quorumNumerator() public view virtual returns (uint256) {
        return _quorumNumerator;
    }

    function quorumDenominator() public pure virtual returns (uint256) {
        return 100;
    }

    function quorum(uint256 blockNumber) public view virtual returns (uint256);

    function updateQuorumNumerator(uint256 newQuorumNumerator) public virtual onlyOwner {
        _updateQuorumNumerator(newQuorumNumerator);
    }

    function _updateQuorumNumerator(uint256 newQuorumNumerator) internal virtual {
        require(
            newQuorumNumerator <= quorumDenominator(),
            "quorumNumerator over quorumDenominator"
        );

        uint256 oldQuorumNumerator = _quorumNumerator;
        _quorumNumerator = newQuorumNumerator;

        emit QuorumNumeratorUpdated(oldQuorumNumerator, newQuorumNumerator);
    }
}
