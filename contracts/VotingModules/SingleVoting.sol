// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import "../common/Enum.sol";

contract SingleVoting {
    using SafeMath for uint;

    struct Delegation {
        mapping(address => bool) isDelegated;
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

    function delegateVotes(address delegatee) external {
        // lock tokens
        // find a way to ensure only one proposal at a time
        require(IERC20(_governanceToken).balanceOf(msg.sender) >= 1);
        require(delegations[delegatee].isDelegated[delegatee] == false);
        delegations[delegatee].lastBlock = block.number;
        delegations[delegatee].isDelegated[delegatee] = true;
        delegations[delegatee].total++;
    }

    function undelegateVotes(address delegatee) external {
        require(delegations[delegatee].isDelegated[delegatee] == true);
        require(delegations[delegatee].total >= 1);
        delegations[delegatee].isDelegated[delegatee] = false;
        delegations[delegatee].total--;
    }

    function calculateWeight(address delegate) external view returns (uint) {
        require(delegations[delegate].lastBlock < block.number, "cannot vote in the same block as delegation");
        // can return quadtric here
        return delegations[delegate].total;
    }
}
