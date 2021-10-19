// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "./BaseTokenVoting.sol";

/// @title OpenZeppelin Linear Voting Strategy - A Seele strategy that enables compount like voting.
/// @author Nathan Ginnever - <team@tokenwalk.org>
contract SingleVoting is BaseTokenVoting {
    uint256 public memberCount;

    mapping(address => bool) public members;

    modifier onlyMember() {
        require(members[msg.sender] == true);
        _;
    }

    event MemberAdded(address member);
    event MemverRemoved(address member);

    constructor(
        address _owner,
        address _seeleModule,
        uint256 _votingPeriod,
        uint256 _quorumThreshold,
        uint256 _timeLockPeriod,
        string memory name_
    ) {
        bytes memory initParams = abi.encode(
            _owner,
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
            address _seeleModule,
            uint256 _votingPeriod,
            uint256 _quorumThreshold,
            uint256 _timeLockPeriod,
            string memory name_
        ) = abi.decode(
                initParams,
                (
                    address,
                    address,
                    uint256,
                    uint256,
                    uint256,
                    string
                )
            );
        require(_votingPeriod > 1, "votingPeriod must be greater than 1");
        require(_seeleModule != address(0), "invalid seele module");
        require(_quorumThreshold > 0, "threshold must ne non-zero");
        __Ownable_init();
        __EIP712_init_unchained(name_, version());
        transferOwnership(_owner);
        votingPeriod = _votingPeriod * 1 seconds; // switch to hours in prod
        seeleModule = _seeleModule;
        quorumThreshold = _quorumThreshold;
        timeLockPeriod = _timeLockPeriod * 1 seconds;
        emit StrategySetup(_seeleModule, _owner);
    }

    function addMember(address member) public onlyOwner {
        members[member] = true;
        memberCount++;
        emit MemberAdded(member);
    }

    function removeMember(address member) public onlyOwner {
        members[member] = false;
        memberCount--;
        emit MemverRemoved(member);
    }

    function calculateWeight(address voter, uint256 proposalId)
        public
        view
        override
        returns (uint256)
    {
        require(members[voter], "voter is not a member");
        return 1;
    }
}
