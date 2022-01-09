// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "../extensions/BaseTokenVoting.sol";
import "../extensions/BaseMember.sol";
import "../extensions/BaseQuorumPercent.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Usul strategy that enables compount like voting.
/// @author Nathan Ginnever - <team@hyphal.xyz>
contract MemberQuadraticVoting is
    BaseTokenVoting,
    BaseMember,
    BaseQuorumPercent
{
    ERC20Votes public governanceToken;

    constructor(
        address _owner,
        ERC20Votes _governanceToken,
        address _UsulModule,
        uint256 _votingPeriod,
        uint256 quorumNumerator_,
        uint256 _timeLockPeriod,
        string memory name_,
        address[] memory _members
    ) {
        bytes memory initParams = abi.encode(
            _owner,
            _governanceToken,
            _UsulModule,
            _votingPeriod,
            quorumNumerator_,
            _timeLockPeriod,
            name_,
            _members
        );
        setUp(initParams);
    }

    function setUp(bytes memory initParams) public override initializer {
        (
            address _owner,
            ERC20Votes _governanceToken,
            address _UsulModule,
            uint256 _votingPeriod,
            uint256 quorumNumerator_,
            uint256 _timeLockPeriod,
            string memory name_,
            address[] memory _members
        ) = abi.decode(
                initParams,
                (
                    address,
                    ERC20Votes,
                    address,
                    uint256,
                    uint256,
                    uint256,
                    string,
                    address[]
                )
            );
        require(_votingPeriod > 1, "votingPeriod must be greater than 1");
        require(
            _governanceToken != ERC20Votes(address(0)),
            "invalid governance token address"
        );
        __Ownable_init();
        for (uint256 i = 0; i < _members.length; i++) {
            addMember(_members[i]);
        }
        governanceToken = _governanceToken;
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
        uint256 threshhold = (governanceToken.getPastTotalSupply(blockNumber) *
            quorumNumerator()) / quorumDenominator();
        return sqrt(threshhold);
    }

    /// @notice given that token weight is quadratically scalled down, we need more precision
    function quorumDenominator() public pure override returns (uint256) {
        return 100;
    }

    function calculateWeight(address voter, uint256 proposalId)
        public
        view
        override
        onlyMember(voter)
        returns (uint256)
    {
        return
            sqrt(
                governanceToken.getPastVotes(
                    voter,
                    proposals[proposalId].startBlock
                )
            );
    }

    // babylonian method (https://en.wikipedia.org/wiki/Methods_of_computing_square_roots#Babylonian_method)
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
