// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IHouseDAO {
	struct Role {
		bool headOfHouse;
		bool member;
	}

    struct Member {
        uint256 shares; // the # of voting shares assigned to this member
        Role roles;
    }

    struct Proposal {
        address memberAddress;
        Role role;
        uint256 yesVotes; // the total number of YES votes for this proposal
        uint256 noVotes; // the total number of NO votes for this proposal
        mapping(address => bool) votesByMember; // the votes on this proposal by each member        
        bool executed;
        uint deadline;
        address proposer;
    }

	// struct ChangeRoleProposal {
	// 	address memberAddress;
	// 	Role role;
 //        uint256 yesVotes; // the total number of YES votes for this proposal
 //        uint256 noVotes; // the total number of NO votes for this proposal
 //        mapping(address => bool) votesByMember; // the votes on this proposal by each member		
 //        bool executed;
 //        uint deadline;
 //        address proposer;
	// }

    // TODO: combine all of these into one
	struct NFTProposal {
		address nftAddress;
		uint nftId;
		bool forSale;
        uint256 yesVotes; // the total number of YES votes for this proposal
        uint256 noVotes; // the total number of NO votes for this proposal
        mapping(address => bool) votesByMember; // the votes on this proposal by each member		
        bool executed;
        uint deadline;
        address proposer;
	}

	struct AdminWithdrawFundsProposal {
		uint funding;
        uint256 yesVotes; // the total number of YES votes for this proposal
        uint256 noVotes; // the total number of NO votes for this proposal
        mapping(address => bool) votesByMember; // the votes on this proposal by each member		
        bool executed;
        uint deadline;
        address proposer;
	}

	struct CommissionNFTProposal {
		uint funding;
        uint256 yesVotes; // the total number of YES votes for this proposal
        uint256 noVotes; // the total number of NO votes for this proposal
        mapping(address => bool) votesByMember; // the votes on this proposal by each member		
        bool executed;
        uint deadline;
        address proposer;
	}
	
	struct GallerySplitProposal {
		uint splitPercent;
        uint256 yesVotes; // the total number of YES votes for this proposal
        uint256 noVotes; // the total number of NO votes for this proposal
        mapping(address => bool) votesByMember; // the votes on this proposal by each member		
        bool executed;
        uint deadline;
        address proposer;
	}

	struct ExhibitProposal {
		uint funding;
		uint startDate;
        uint256 yesVotes; // the total number of YES votes for this proposal
        uint256 noVotes; // the total number of NO votes for this proposal
        mapping(address => bool) votesByMember; // the votes on this proposal by each member		
        bool executed;
        uint deadline;
        address proposer;
	}
}