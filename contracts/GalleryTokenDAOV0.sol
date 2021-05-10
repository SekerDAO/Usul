pragma solidity ^0.8.0;

import Exhibit from './ExhibitV0.sol';
import ERC20 from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import IGalleryDAO from './interfaces/IGalleryDAOV0';

contract GalleryTokenDAOV0 is IGalleryDAOV0, ExhibitV0, ERC20 {
	mapping(address => Member) private members;
	mapping(uint => Proposal) public proposals;
	mapping(address => uint) public contributors; // donator => amount donated in eth

	address public currency; // token address of deposit currency, default weth
	uint public governanceTokenSupply = 0;
	uint public proposalCount = 0; // number of open proposals
	address private initialCoordinator;
	uint public adminCap;
	uint public gallerySplitNFTSale; // the amount profit the gallery takes on sales
	uint public gallerySplitEventAdmissions; // the profit taken from admissions
	uint public votingThreshold; // number of votes needed to accept proposal

    modifier onlyMember {
        require(members[msg.sender].member == true, "not a member");
        _;
    }

    modifier onlyNFTContributor {
        require(members[msg.sender].NFTContributor == true, "not an artist");
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

	constructor(
		uint _governanceTokenSupply,
		uint _adminCap,
		address _stakeToken,
		string _name,
		string _symbol,
		address _currency,
		uint _gallerySplit
	) ERC20(_name, _symbol) {
		governanceTokenSupply = _governanceTokenSupply
		initialCoordinator = msg.sender;
		stakeTokenAddress = _stakeToken;
		currency = _currency;
		adminCap = _adminCap;
		gallerySplit = _gallerySplit;
		// todo: allow setting issuance rate of gov token
		IERC20(stakeTokenAddress).safeTransferFrom(msg.sender, address(this), _governanceTokenSupply);
	}

	function addAdmin() onlyAdmin {
		// code
		Roles memeory _role = Role(true, false, false, true);
	}

	function enterDAO(uint _contribution) public {
		require(_contribution > 0, "contributors must supply something");
		IERC20(currency).safeTransferFrom(msg.sender, address(this), _contribution);
		_mint(_contribution, msg.sender);
		IERC20(governanceToken).safeTransfer(msg.sender, _contribution);
		Roles memeory _role = Role(false, false, false, true);
		Member memory _memmber = Member(_contribution, _role, 0, 0);
		members[msg.sender] = _member;
	}

	function exhibitProposal() onlyMember {
		// record how much of the gallery holdings the admins can withdraw for the exhibit

	}

	function enterNFTProposal() onlyNFTContributor {

	}

	function gallerySplitProposal() onlyMember {

	}

	// others may ask to support this gallery and thier artists
	function createPublicCommissionProposal() public {

	}

	// complete a commission proposal and send the nft
	function submitCommission() onlyNFTContributor {

	}

	// members can propose spending gallery funds ot commision an artist
	function createGalleryCommissionProposal() onlyMember {

	}

	// MOVE THIS TO HOUSES
	function NFTPurchaseProposal() onlyCurator {

	}

	function adminWithdrawFundsProposal() onlyAdmin {

	}

	// can alsoi remove roles here
	function changeRoleProposal(Role _role) onlyCurator {

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