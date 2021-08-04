// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../common/Enum.sol";

contract SingleVoting {
    using SafeMath for uint256;

    struct Delegation {
        mapping(address => bool) isDelegated;
        uint256 lastBlock;
        uint256 total;
        bool votingActive;
    }

    address private _governanceToken;
    address private _proposalModule;

    mapping(address => Delegation) delegations;

    modifier onlyProposalModule() {
        require(msg.sender == _proposalModule, "TW023");
        _;
    }

    event VotesDelegated(uint256 number);
    event VotesUndelegated(uint256 number);

    constructor(address governanceToken_, address proposalModule_) {
        _governanceToken = governanceToken_;
        _proposalModule = proposalModule_;
    }

    function delegateVotes(address delegatee) external {
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

    function startVoting(address delegatee) external onlyProposalModule {
        delegations[delegatee].votingActive == true;
    }

    function endVoting(address delegatee) external onlyProposalModule {
        delegations[delegatee].votingActive == false;
    }

    function calculateWeight(address delegate) external view returns (uint256) {
        require(
            delegations[delegate].lastBlock < block.number,
            "cannot vote in the same block as delegation"
        );
        return delegations[delegate].total;
    }
}
