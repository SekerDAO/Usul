pragma solidity ^0.8.0;

import Exhibit from './ExhibitV0.sol';
import IERC20 from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import IGalleryDAO from './interfaces/IGalleryDAOV0';

contract GalleryDAOV0 is IGalleryDAOV0, ExhibitV0 {
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

	function proposeExhibit() onlyAdmin {

	}


	function Proposal(Proposal _type) onlyMember {

	}

	function enterNFTProposal() public {

	}

	// others may ask to support this gallery and thier artists
	function acceptCommissionProposal() onlyMember {

	}

	function NFTPurchaseProposal() onlyCurator {

	}

	function addRoleProposal(Role _role) onlyCurator {

	}

	function removeRoleProposal(Role _role, address _memember) {

	}

	function voteOnProposal(Proposal _type, bool _vote) {

	}

	function donate() payable {

	}

	// native token of the dao
	function updateToken() public onlyAdmin {

	}

	function burnCoordinator() public {
		require(msg.sender == initialCoordinator, "only coordinator can remove themselves")
		initialCoordinator = address(0);
	}

}