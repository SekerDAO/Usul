// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "../extensions/BaseTokenVoting.sol";
import "../extensions/BaseMember.sol";
import "../extensions/BaseQuorumPercent.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Usul strategy that enables compount like voting.
/// @author Nathan Ginnever - <team@hyphal.xyz>
contract SimpleMemberVoting is BaseTokenVoting, BaseMember, BaseQuorumPercent {
    struct Checkpoint {
        uint32 fromBlock;
        uint256 members;
    }

    Checkpoint[] private _totalMemberCheckpoints;

    constructor(
        address _owner,
        address _UsulModule,
        uint256 _votingPeriod,
        uint256 quorumNumerator_,
        uint256 _timeLockPeriod,
        string memory name_
    ) {
        bytes memory initParams = abi.encode(
            _owner,
            _UsulModule,
            _votingPeriod,
            quorumNumerator_,
            _timeLockPeriod,
            name_
        );
        setUp(initParams);
    }

    function setUp(bytes memory initParams) public override initializer {
        (
            address _owner,
            address _UsulModule,
            uint256 _votingPeriod,
            uint256 quorumNumerator_,
            uint256 _timeLockPeriod,
            string memory name_
        ) = abi.decode(
                initParams,
                (address, address, uint256, uint256, uint256, string)
            );
        require(_votingPeriod > 1, "votingPeriod must be greater than 1");
        __Ownable_init();
        __EIP712_init_unchained(name_, version());
        updateQuorumNumerator(quorumNumerator_);
        transferOwnership(_owner);
        votingPeriod = _votingPeriod * 1 seconds; // switch to hours in prod
        UsulModule = _UsulModule;
        timeLockPeriod = _timeLockPeriod * 1 seconds;
        name = name_;
        emit StrategySetup(_UsulModule, _owner);
    }

    function addMember(address member) public override onlyOwner {
        require(members[member] == false, "member is already registered");
        members[member] = true;
        _writeCheckpoint(_totalMemberCheckpoints, _add, 1);
        memberCount++;
        emit MemberAdded(member);
    }

    function removeMember(address member) public override onlyOwner {
        require(members[member] == true, "member is not registered");
        members[member] = false;
        _writeCheckpoint(_totalMemberCheckpoints, _subtract, 1);
        memberCount--;
        emit MemberRemoved(member);
    }

    /// @dev Determines if a proposal has succeeded.
    /// @param proposalId the proposal to vote for.
    /// @return boolean.
    function isPassed(uint256 proposalId) public view override returns (bool) {
        require(
            proposals[proposalId].yesVotes > proposals[proposalId].noVotes,
            "majority yesVotes not reached"
        );
        require(
            proposals[proposalId].yesVotes +
                proposals[proposalId].abstainVotes >=
                quorum(proposals[proposalId].startBlock),
            "a quorum has not been reached for the proposal"
        );
        require(
            proposals[proposalId].deadline < block.timestamp,
            "voting period has not passed yet"
        );
        return true;
    }

    function quorum(uint256 blockNumber)
        public
        view
        override
        returns (uint256)
    {
        return
            (getPastTotalMembers(blockNumber) * quorumNumerator()) /
            quorumDenominator();
    }

    function _writeCheckpoint(
        Checkpoint[] storage ckpts,
        function(uint256, uint256) view returns (uint256) op,
        uint256 delta
    ) private returns (uint256 oldWeight, uint256 newWeight) {
        uint256 pos = ckpts.length;
        oldWeight = pos == 0 ? 0 : ckpts[pos - 1].members;
        newWeight = op(oldWeight, delta);

        if (pos > 0 && ckpts[pos - 1].fromBlock == block.number) {
            ckpts[pos - 1].members = newWeight;
        } else {
            ckpts.push(
                Checkpoint({
                    fromBlock: SafeCast.toUint32(block.number),
                    members: newWeight
                })
            );
        }
    }

    /**
     * @dev Retrieve the `totalSupply` at the end of `blockNumber`. Note, this value is the sum of all balances.
     * It is but NOT the sum of all the delegated votes!
     *
     * Requirements:
     *
     * - `blockNumber` must have been already mined
     */
    function getPastTotalMembers(uint256 blockNumber)
        public
        view
        returns (uint256)
    {
        require(blockNumber < block.number, "ERC20Votes: block not yet mined");
        return _checkpointsLookup(_totalMemberCheckpoints, blockNumber);
    }

    /**
     * @dev Lookup a value in a list of (sorted) checkpoints.
     */
    function _checkpointsLookup(Checkpoint[] storage ckpts, uint256 blockNumber)
        private
        view
        returns (uint256)
    {
        // We run a binary search to look for the earliest checkpoint taken after `blockNumber`.
        //
        // During the loop, the index of the wanted checkpoint remains in the range [low-1, high).
        // With each iteration, either `low` or `high` is moved towards the middle of the range to maintain the invariant.
        // - If the middle checkpoint is after `blockNumber`, we look in [low, mid)
        // - If the middle checkpoint is before or equal to `blockNumber`, we look in [mid+1, high)
        // Once we reach a single value (when low == high), we've found the right checkpoint at the index high-1, if not
        // out of bounds (in which case we're looking too far in the past and the result is 0).
        // Note that if the latest checkpoint available is exactly for `blockNumber`, we end up with an index that is
        // past the end of the array, so we technically don't find a checkpoint after `blockNumber`, but it works out
        // the same.
        uint256 high = ckpts.length;
        uint256 low = 0;
        while (low < high) {
            uint256 mid = Math.average(low, high);
            if (ckpts[mid].fromBlock > blockNumber) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        return high == 0 ? 0 : ckpts[high - 1].members;
    }

    function _add(uint256 a, uint256 b) private pure returns (uint256) {
        return a + b;
    }

    function _subtract(uint256 a, uint256 b) private pure returns (uint256) {
        return a - b;
    }

    function calculateWeight(address voter, uint256 proposalId)
        public
        view
        override
        onlyMember(voter)
        returns (uint256)
    {
        return 1;
    }
}
