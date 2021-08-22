// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../common/Enum.sol";
import "../interfaces/IProposal.sol";

contract MemberLinearVoting {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct Delegation {
        mapping(address => uint256) votes;
        uint256 undelegateDelay;
        uint256 lastBlock;
        uint256 total;
    }

    uint256 public memberCount;
    address private _governanceToken;
    address private _proposalModule;
    uint256 private _undelegateDelay;
    address private _roleModule;
    /// @dev Address that this module will pass transactions to.
    address public executor;

    mapping(address => Delegation) public delegations;
    mapping(address => bool) public members;

    modifier onlyExecutor() {
        require(msg.sender == executor, "TW001");
        _;
    }

    modifier onlyMember() {
        require(members[msg.sender] == true);
        _;
    }

    event VotesDelegated(uint256 number);
    event VotesUndelegated(uint256 number);

    constructor(
        address governanceToken_,
        address proposalModule_,
        uint256 undelgateDelay_,
        address executor_
    ) {
        _governanceToken = governanceToken_;
        _proposalModule = proposalModule_;
        _undelegateDelay = undelgateDelay_;
        executor = executor_;
    }

    function addMember(address member) public onlyExecutor {
        members[member] = true;
        memberCount++;
    }

    function removeMember(address member) public onlyExecutor {
        members[member] = false;
        memberCount--;
    }

    /// @dev Sets the executor to a new account (`newExecutor`).
    /// @notice Can only be called by the current owner.
    function setExecutor(address _executor) public onlyExecutor {
        executor = _executor;
    }

    function registerRoleModule(address module) external onlyExecutor {
        _roleModule = module;
    }

    function governanceToken() public view virtual returns (address) {
        return _governanceToken;
    }

    function getDelegatorVotes(address delegatee, address delegator)
        public
        view
        virtual
        returns (uint256)
    {
        return delegations[delegatee].votes[delegator];
    }

    // todo erc712 delegation

    function delegateVotes(address delegatee, uint256 amount)
        external
        onlyMember
    {
        IERC20(_governanceToken).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
        delegations[delegatee].votes[msg.sender] = amount;
        delegations[delegatee].lastBlock = block.number;
        // can make the total 1-1 here
        delegations[delegatee].total = delegations[delegatee].total.add(amount);
    }

    // todo erc712 undelegation

    function undelegateVotes(address delegatee, uint256 amount) external {
        require(
            delegations[delegatee].undelegateDelay <= block.timestamp,
            "TW024"
        );
        require(delegations[delegatee].votes[msg.sender] >= amount, "TW020");
        IERC20(_governanceToken).safeTransfer(msg.sender, amount);
        delegations[delegatee].votes[msg.sender] = delegations[delegatee]
            .votes[msg.sender]
            .sub(amount);
        delegations[delegatee].total = delegations[delegatee].total.sub(amount);
    }

    // todo: erc712 voting

    function vote(uint256 proposalId, bool vote) external onlyMember {
        startVoting(msg.sender);
        require(checkBlock(msg.sender), "TW021");
        IProposal(_proposalModule).receiveVote(
            msg.sender,
            proposalId,
            vote,
            calculateWeight(msg.sender)
        );
    }

    function startVoting(address delegatee) internal {
        delegations[delegatee].undelegateDelay =
            block.timestamp +
            _undelegateDelay;
    }

    function calculateWeight(address delegatee) public view returns (uint256) {
        uint256 votes = delegations[delegatee].votes[delegatee];
        require(delegations[delegatee].total > 0, "TW035");
        return delegations[delegatee].total;
    }

    function checkBlock(address delegatee) public view returns (bool) {
        return (delegations[delegatee].lastBlock != block.number);
    }
}
