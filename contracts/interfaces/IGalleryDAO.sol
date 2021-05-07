pragma solidity ^0.8.0;

interface IGalleryDAO {

	struct Role {
		bool admin;
		bool curator;
		bool artist;
		bool member;
	}

    struct Member {
        address delegateKey; // the key responsible for submitting proposals and voting - defaults to member address unless updated
        uint256 shares; // the # of voting shares assigned to this member
        Role roles;
        uint256 highestIndexYesVote; // highest proposal index # on which the member voted YES
        uint256 jailed; // set to proposalIndex of a passing guild kick proposal for this member, prevents voting on and sponsoring proposals
    }

	struct Proposal {
        uint256 yesVotes; // the total number of YES votes for this proposal
        uint256 noVotes; // the total number of NO votes for this proposal
        mapping(address => Vote) votesByMember; // the votes on this proposal by each member		
	}

	enum Vote {
        Null, // default value, counted as abstention
        Yes,
        No
    }

}