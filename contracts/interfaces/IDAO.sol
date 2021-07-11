// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../common/Enum.sol";

interface IDAO {
	struct Role {
		bool headOfHouse;
		bool member;
	}

    struct Member {
        Role roles;
        bool activeProposal;
    }

    struct Proposal {
    	uint256 value;
        Role role; // role change proposed
        uint256 yesVotes; // the total number of YES votes for this proposal
        uint256 noVotes; // the total number of NO votes for this proposal        
        bool executed;
        bool queued;
        uint deadline;
        address proposer;
        bool canceled;
        uint gracePeriod;
        mapping(address => bool) hasVoted;
        address targetAddress;
        bytes data;
        Enum.Operation operation;
    }
}