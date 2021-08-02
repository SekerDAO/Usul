// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import "../common/Enum.sol";

contract LinearVoting {
    using SafeMath for uint;

    struct Delegation {
        mapping(address => uint) votes;
        uint lastBlock;
        uint total;
    }

    // DAO name
    address private _governanceToken;

    mapping(address => Delegation) delegations;

    event VotesDelegated(uint number);

    constructor(
        address governanceToken_,
        address proposalModule_
    ) {
        _governanceToken = governanceToken_;
    }

    function delegateVotes(address delegatee, uint amount) external {
        // lock tokens
        // find a way to ensure only one proposal at a time
        IERC20(_governanceToken).transferFrom(msg.sender, address(this), amount);
        delegations[delegatee].votes[msg.sender] = amount;
        delegations[delegatee].lastBlock = block.number;
        // can make the total 1-1 here
        delegations[delegatee].total = delegations[delegatee].total.add(amount);
    }

    function undelegateVotes(address delegatee, uint amount) external {
        require(delegations[delegatee].votes[msg.sender] >= amount);
        IERC20(_governanceToken).transfer(msg.sender, amount);
        delegations[delegatee].votes[msg.sender] = delegations[delegatee].votes[msg.sender].sub(amount);
        delegations[delegatee].total = delegations[delegatee].total.sub(amount);
    }

    function calculateWeight(address delegate) external view returns (uint) {
        require(delegations[delegate].lastBlock < block.number, "cannot vote in the same block as delegation");
        // can return quadtric here
        return delegations[delegate].total;
    }
}
