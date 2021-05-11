pragma solidity ^0.8.0;

import Exhibit from './ExhibitV0.sol';
import ERC20 from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import IERC20 from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import IERC721 from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import IGalleryDAO from './interfaces/IGalleryDAOV0';
// import market contracts

contract GalleryTokenDAOV0 is IGalleryDAOV0, ExhibitV0, ERC20 {
	mapping(address => Member) private members;
	mapping(uint => NFTProposal) public nftProposals;
	mapping(uint => TransferNFTProposal) public transferNFTProposals;
	mapping(uint => GallerySplitProposal) public gallerySplitProposals;
	mapping(uint => ExhibitProposal) public exhibitProposals;
	mapping(address => uint) public contributors; // donator => amount donated in eth

	mapping(address => mapping(address => uint)) public lentNFTs; // owner => nftAddress => nftId.. nfts on lend to the gallery
	mapping(uint => mapping(address => uint)) public galleryNFTs; // count => nft address => nft id

	//address[] public ownedNFTs; // list of all owned nfts
	uint public galleryNFTCount = 0;
	uint public exhibitCount = 0;
	uint public splitCount = 0;
	uint public transferProposalCount = 0;


	address public currency; // token address of deposit currency, default weth
	uint public governanceTokenSupply = 0;
	uint public nftProposalCount = 0; // number of open proposals
	address private initialCoordinator;
	uint public adminCap;
	uint public gallerySplitNFTSale; // the amount profit the gallery takes on sales
	uint public gallerySplitEventAdmissions; // the profit taken from admissions
	uint public votingThreshold; // number of votes needed to accept proposal
	uint public proposalDuration;
	address _private wethAddress = "0x0";

	// Constants
    uint256 constant MAX_VOTING_PERIOD_LENGTH = 10**18; // maximum length of voting period

    // Modifiers
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

    // Events
    event EnterNFTProposed()
    event GallerySplitProposed()
    event PublicCommissionProposed()


	constructor(
		uint _governanceTokenSupply,
		uint _adminCap,
		address _stakeToken,
		string _name,
		string _symbol,
		address _currency,
		uint _gallerySplit,
		uint _proposalDuration
	) ERC20(_name, _symbol) {
		governanceTokenSupply = _governanceTokenSupply
		initialCoordinator = msg.sender;
		stakeTokenAddress = _stakeToken;
		currency = _currency;
		adminCap = _adminCap;
		gallerySplit = _gallerySplit;
		proposalDuration = _proposalDuration;
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

		// event
	}

	function exhibitProposal(uint _funding, uint _startDate) onlyMember {
		// record how much of the gallery holdings the admins can withdraw for the exhibit
		require(_funding > 0 && _funding <= IERC20(wethAddress).balanceOf(address(this)), "must give appropriate funding amount");
		require(_startDate > now, "start date must be in the future");

		exhibitProposals[exhibitCount].funding = _funding;
		exhibitProposals[exhibitCount].startDate = _startDate;
		exhibitProposals[exhibitCount].yesVotes = IERC20(stakeTokenAddress).balanceOf(msg.sender);
		exhibitProposals[exhibitCount].noVotes = 0;
		exhibitProposals[exhibitCount].votesByMember[msg.sender] = true;
		exhibitProposals[exhibitCount].executed = false;
		exhibitCount++;

		// event
	}

	function enterNFTProposal(address _nftAddress, uint _nftId) onlyNFTContributor {
		require(_nftAddress != address(0), "nft must have an address");
		require(IERC20(stakeTokenAddress).balanceOf(msg.sender) >= 1, "all proposals must have governance tokens");
		require(IERC721(_nftAddress).ownerOf(_nftId) == msg.sender, "contributor must own the nft");

		nftProposals[nftProposalCount].nftAddress = _nftAddress;
		nftProposals[nftProposalCount].nftId = _nftId;
		nftProposals[nftProposalCount].yesVotes = IERC20(stakeTokenAddress).balanceOf(msg.sender);
		nftProposals[nftProposalCount].noVotes = 0;
		nftProposals[nftProposalCount].votesByMember[msg.sender] = true;
		nftProposals[nftProposalCount].executed = false;
		nftProposalCount++;

		// event
	}

	// override governance to allow curators to quickly add pieces
	function enterNFTCurator(address _nftAddress, uint _nftId) onlyCurator {
		require(IERC721(_nftAddress).ownerOf(_nftId) == msg.sender, "contributor must own the nft");
		require(IERC721(_nftAddress).transferFrom(msg.sender, address(this), _nftId), "failed to transfer nft");

		// event
	}

	// override governance to allow curators to quickly transfer pieces
	// this is highly trusted (maybe don't allow this)
	function transferNFTCurator(address _nftAddress, uint _nftId, address _receiver) onlyCurator {
		require(IERC721(_nftAddress).ownerOf(_nftId) == address(this), "dao must own the nft");
		require(IERC721(_nftAddress).transfer(msg.sender, _receiver, _nftId), "failed to transfer nft");

		// event
	}

	// the dao may propose transfering an nft away from the dao
	function transferNFTProposal(address _nftAddress, uint _nftId) onlyMember {
		require(_nftAddress != address(0), "nft must have an address");
		require(IERC20(stakeTokenAddress).balanceOf(msg.sender) >= 1, "all proposals must have governance tokens");
		require(IERC721(_nftAddress).ownerOf(_nftId) == address(this), "dao must own the nft");

		gallerySplitProposals[transferProposalCount].nftAddress = _nftAddress;
		gallerySplitProposals[transferProposalCount].yesVotes = IERC20(stakeTokenAddress).balanceOf(msg.sender);
		gallerySplitProposals[transferProposalCount].noVotes = 0;
		gallerySplitProposals[transferProposalCount].votesByMember[msg.sender] = true;
		gallerySplitProposals[transferProposalCount].executed = false;
		transferProposalCount++;

		// event
	}

	// set the amount the dao takes from exhibit events and sales
	function gallerySplitProposal(uint _splitProposal) onlyMember {
		require(IERC20(stakeTokenAddress).balanceOf(msg.sender) >= 1, "all proposals must have governance tokens");
		require(_splitProposal <= 100, "must split 100 percent or less");

		transferNFTProposals[splitCount].splitPercent = _splitProposal;
		transferNFTProposals[splitCount].nftId = _nftId;
		transferNFTProposals[splitCount].yesVotes = IERC20(stakeTokenAddress).balanceOf(msg.sender);
		transferNFTProposals[splitCount].noVotes = 0;
		transferNFTProposals[splitCount].votesByMember[msg.sender] = true;
		transferNFTProposals[splitCount].executed = false;
		splitCount++;

		// event
	}

	// others may ask to support this gallery and thier artists
	function createPublicCommissionProposal(uint _funding) public {
		// just mark the commission so its public, hold the funds until complete
	}

	function submitNFTCommission(address _nftAddress, uint _nftId) onlyNFTContributor {
		// get the receiver
		// transfer the nft
		// transfer payment
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

	// can also remove roles here
	function changeRoleProposal(Role _role) onlyMember {

	}

	function voteOnProposal(Proposal _type, bool _vote) {

	}

	function donate(_amount) {
		require(IERC20(wethAddress).transferFrom(msg.sender, address(this), _amount), "transfer failed");
		contributors[msg.sender] = _amount;
	}

	// native token of the dao
	function updateToken() public onlyAdmin {

	}

	function lendNFT(uint _lendDuration) public {

	}

	function confirmProposal() public {
		require(proposals[_proposalId.yesVotes > proposals[_proposalId.noVotes]);
		require(proposals[_proposalId.yesVotes >= votingThreshold);
		// confirm
	}

	function burnCoordinator() public {
		require(msg.sender == initialCoordinator, "only coordinator can remove themselves")
		initialCoordinator = address(0);
	}

}