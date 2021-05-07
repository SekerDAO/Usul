pragma solidity ^0.8.0;

import IERC20 from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import IGalleryDAO from './interfaces/IGalleryDAO';

contract GalleryDAO is IGalleryDAO {
	mapping(address => Member) private members;
	mapping(uint => Proposal) public proposals;
	mapping(address => uint) public donators; // donator => amount donated in eth

	uint public proposalCount;

	address private initialCoordinator;

	address public tokenAddress;

	uint public tokenSupply;

    modifier onlyMember {
        require(members[msg.sender].member == true, "not a member");
        _;
    }

    modifier onlyArtist {
        require(members[msg.sender].artist == true, "not an artist");
        _;
    }

    modifier onlyCurator {
        require(members[msg.sender].curator == true, "not a curator");
        _;
    }

    modifier onlyAdmin {
        require(members[msg.sender].admin == true, "not an admin");
        _;
    }

	constructor(uint _initialTokenSupply, address _token) {
		tokenSupply = _initialTokenSupply
		initialCoordinator = msg.sender;
		tokenAddress = _token;
	}

	


	function createProposal(Proposal _type) onlyMember {

	}

	function createCommissionArtProposal() onlyMember {

	}

	function createNFTPurchaseProposal() onlyCurator {

	}

	function createAddRoleProposal(Role _role) onlyCurator {

	}

	function createRemoveRoleProposal(Role _role, address _memember) {

	}

	function voteOnProposal(Proposal _type, bool _vote) {

	}

	function donate() payable {

	}

	function updateToken() public onlyAdmin {

	}

	function burnCoordinator() public {
		require(msg.sender == initialCoordinator, "only coordinator can remove themselves")
		initialCoordinator = address(0);
	}

}