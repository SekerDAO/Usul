// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "../extensions/BaseTokenVoting.sol";
import "../extensions/BaseMember.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Seele strategy that enables compount like voting.
/// @author Nathan Ginnever - <team@hyphal.xyz>
contract MemberQuadraticVoting is BaseTokenVoting, BaseMember {
    ERC20Votes public governanceToken;

    constructor(
        address _owner,
        ERC20Votes _governanceToken,
        address _seeleModule,
        uint256 _votingPeriod,
        uint256 _quorumThreshold,
        uint256 _timeLockPeriod,
        string memory name_
    ) {
        bytes memory initParams = abi.encode(
            _owner,
            _governanceToken,
            _seeleModule,
            _votingPeriod,
            _quorumThreshold,
            _timeLockPeriod,
            name_
        );
        setUp(initParams);
    }

    function setUp(bytes memory initParams) public override initializer {
        (
            address _owner,
            ERC20Votes _governanceToken,
            address _seeleModule,
            uint256 _votingPeriod,
            uint256 _quorumThreshold,
            uint256 _timeLockPeriod,
            string memory name_
        ) = abi.decode(
                initParams,
                (
                    address,
                    ERC20Votes,
                    address,
                    uint256,
                    uint256,
                    uint256,
                    string
                )
            );
        require(_votingPeriod > 1, "votingPeriod must be greater than 1");
        require(
            _governanceToken != ERC20Votes(address(0)),
            "invalid governance token address"
        );
        governanceToken = _governanceToken;
        __Ownable_init();
        __EIP712_init_unchained(name_, version());
        transferOwnership(_owner);
        votingPeriod = _votingPeriod * 1 seconds; // switch to hours in prod
        seeleModule = _seeleModule;
        quorumThreshold = _quorumThreshold;
        timeLockPeriod = _timeLockPeriod * 1 seconds;
        emit StrategySetup(_seeleModule, _owner);
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
