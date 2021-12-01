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
                quorum(block.number),
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
            (memberCount * quorumNumerator()) /
            quorumDenominator();
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
