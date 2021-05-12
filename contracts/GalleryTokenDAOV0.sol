// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import './ExhibitV0.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import './interfaces/IGalleryDAOV0.sol';
import './DAOBase.sol';
// import market contracts

contract GalleryTokenDAOV0 is IGalleryDAOV0, ExhibitV0, ERC20, DAOBase {
	mapping(address => Member) private members;

	mapping(uint => NFTProposal) public nftProposals;
	mapping(uint => CommissionNFTProposal) public commissionNFTProposals;
	mapping(uint => GallerySplitProposal) public gallerySplitProposals;
	mapping(uint => ExhibitProposal) public exhibitProposals;
	mapping(uint => ChangeRoleProposal) public changeRoleProposals;
	mapping(uint => AdminWithdrawFundsProposal) public adminWithdrawFundsProposals;

	mapping(address => uint) public contributors; // donator => amount donated in eth

	mapping(address => GalleryNFT) public galleryNFTs; // owner => gallery nfts on lend to the gallery

	//address[] public ownedNFTs; // list of all owned nfts
	uint public galleryNFTProposalCount = 0;
	uint public exhibitProposalCount = 0;
	uint public splitCount = 0;
	uint public commissionProposalCount = 0;
	uint public changeRoleProposalsCount = 0;
	uint public adminWithdrawFundsProposalsCount = 0;


	address public currency; // token address of deposit currency, default weth
	uint public governanceTokenSupply = 0;
	address private initialCoordinator;
	uint public adminCap;
	uint public gallerySplitNFTSale; // the amount profit the gallery takes on sales
	uint public gallerySplitEventAdmissions; // the profit taken from admissions
	uint public votingThreshold; // number of votes needed to accept proposal
	uint public proposalDuration;
	uint public stillAccepting = true;

	address private wethAddress = "0x0";

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

    modifier accepting {
    	require(stillAccepting == true);
    	_;
    }

    // Events TODO
    event EnterNFTProposed();
    event GallerySplitProposed();
    event PublicCommissionProposed();

	constructor(
		uint _governanceTokenSupply,
		uint _adminCap,
		address _stakeToken,
		string _name,
		string _symbol,
		//address _currency, default to weth for now
		uint _gallerySplit,
		uint _proposalDuration
	) ERC20(_name, _symbol) {
		governanceTokenSupply = _governanceTokenSupply;
		initialCoordinator = msg.sender;
		stakeTokenAddress = _stakeToken;
		//currency = _currency; // assume weth
		adminCap = _adminCap;
		gallerySplit = _gallerySplit;
		proposalDuration = _proposalDuration;
		// todo: allow setting issuance rate of gov token
		IERC20(stakeTokenAddress).safeTransferFrom(msg.sender, address(this), _governanceTokenSupply);
	}

	// consider removing, this is a convienence but overrides democracy
	function adminAddRole(bool[] memory _roles, address _user) onlyAdmin {
		Roles memeory _role = Role(_roles[0], _roles[1], _roles[2], _roles[3]);

		members[_user].shares = IERC20(governanceToken).balanceOf(_user);
		members[_user].roles = _role;
		members[_user].jailed = false;
	}

	function enterDAO(uint _contribution) accepting  public {
		require(_contribution > 0, "contributors must supply something");
		require(IERC20(governanceToken).balanceOf(address(this) > 0), "no more gov tokens left");
		require(IERC20(wethAddress).balanceOf(msg.sender) >= _contribution, "not enough weth for contribution");
		IERC20(wethAddress).safeTransferFrom(msg.sender, address(this), _contribution);
		IERC20(governanceToken).safeTransfer(msg.sender, _contribution);
		_mint(_contribution, msg.sender);
		Roles memeory _role = Role(false, false, false, true);

		members[msg.sender].shares = IERC20(governanceToken).balanceOf(_user);
		members[msg.sender].roles = _role;
		members[msg.sender].jailed = false;
		// event
	}



	// ---- Proposals ----
	function exhibitProposal(uint _funding, uint _startDate) onlyMember {
		// record how much of the gallery holdings the admins can withdraw for the exhibit
		require(_funding > 0 && _funding <= IERC20(wethAddress).balanceOf(address(this)), "must give appropriate funding amount");
		require(_startDate > now, "start date must be in the future");

		exhibitProposals[exhibitProposalCount].funding = _funding;
		exhibitProposals[exhibitProposalCount].startDate = _startDate;
		exhibitProposals[exhibitProposalCount].yesVotes = IERC20(stakeTokenAddress).balanceOf(msg.sender);
		exhibitProposals[exhibitProposalCount].noVotes = 0;
		exhibitProposals[exhibitProposalCount].votesByMember[msg.sender] = true;
		exhibitProposals[exhibitProposalCount].executed = false;
		exhibitProposals[exhibitProposalCount].deadline = now + votingThreshold;
		exhibitCount++;

		// event
	}

	// contributors can ask for vote to enter art
	function enterNFTProposal(address _nftAddress, uint _nftId, bool _forSale) onlyNFTContributor {
		require(_nftAddress != address(0), "nft must have an address");
		require(IERC20(stakeTokenAddress).balanceOf(msg.sender) >= 1, "all proposals must have governance tokens");
		require(IERC721(_nftAddress).ownerOf(_nftId) == msg.sender, "contributor must own the nft");

		nftProposals[nftProposalCount].nftAddress = _nftAddress;
		nftProposals[nftProposalCount].nftId = _nftId;
		nftProposals[nftProposalCount].forSale = _forSale;
		nftProposals[nftProposalCount].yesVotes = IERC20(stakeTokenAddress).balanceOf(msg.sender);
		nftProposals[nftProposalCount].noVotes = 0;
		nftProposals[nftProposalCount].votesByMember[msg.sender] = true;
		nftProposals[nftProposalCount].executed = false;
		nftProposals[nftProposalCount].deadline = now + votingThreshold;
		galleryNFTProposalCount++;

		// event
	}

	// set the amount the dao takes from exhibit events and sales
	function gallerySplitProposal(uint _splitProposal) onlyMember {
		require(IERC20(stakeTokenAddress).balanceOf(msg.sender) >= 1, "all proposals must have governance tokens");
		require(_splitProposal <= 100, "must split 100 percent or less");

		gallerySplitProposals[splitCount].splitPercent = _splitProposal;
		gallerySplitProposals[splitCount].nftId = _nftId;
		gallerySplitProposals[splitCount].yesVotes = IERC20(stakeTokenAddress).balanceOf(msg.sender);
		gallerySplitProposals[splitCount].noVotes = 0;
		gallerySplitProposals[splitCount].votesByMember[msg.sender] = true;
		gallerySplitProposals[splitCount].executed = false;
		gallerySplitProposals[splitCount].deadline = now + votingThreshold;
		splitCount++;

		// event
	}

	// others may ask to support this gallery and thier artists
	function createCommissionProposal(uint _funding) onlyMember {
		require(IERC20(wethAddress).balanceOf(msg.sender) >= _funding. "not enough weth for commision");
		// just mark the commission so its public, hold the funds until complete
		require(IERC20(wethAddress).safeTransferFrom(msg.sender, address(this), _funding), "fund transfer failed");

		commissionNFTProposals[commissionProposalCount].funding = _funding;
		commissionNFTProposals[commissionProposalCount].yesVotes = IERC20(stakeTokenAddress).balanceOf(msg.sender);
		commissionNFTProposals[commissionProposalCount].noVotes = 0;
		commissionNFTProposals[commissionProposalCount].votesByMember[msg.sender] = true;
		commissionNFTProposals[commissionProposalCount].executed = false;
		commissionNFTProposals[commissionProposalCount].deadline = now + votingThreshold;
		commissionProposalCount++;

		// event
	}

	// can also remove roles here
	function changeRoleProposal(Role _roles, address _member) onlyMember {
		changeRoleProposals[changeRoleProposalsCount].memberAddress = _member;
		changeRoleProposals[changeRoleProposalsCount].role = _roles;
		changeRoleProposals[changeRoleProposalsCount].yesVotes = IERC20(stakeTokenAddress).balanceOf(msg.sender);
		changeRoleProposals[changeRoleProposalsCount].noVotes = 0;
		changeRoleProposals[changeRoleProposalsCount].votesByMember[msg.sender] = true;
		changeRoleProposals[changeRoleProposalsCount].executed = false;
		changeRoleProposals[changeRoleProposalsCount].deadline = now + votingThreshold;
		changeRoleProposalsCount++;

		// event
	}

	function adminWithdrawFundsProposal(uint _funding) onlyAdmin {
		adminWithdrawFundsProposals[adminWithdrawFundsProposalsCount].funding = _funding;
		adminWithdrawFundsProposals[adminWithdrawFundsProposalsCount].yesVotes = IERC20(stakeTokenAddress).balanceOf(msg.sender);
		adminWithdrawFundsProposals[adminWithdrawFundsProposalsCount].noVotes = 0;
		adminWithdrawFundsProposals[adminWithdrawFundsProposalsCount].votesByMember[msg.sender] = true;
		adminWithdrawFundsProposals[adminWithdrawFundsProposalsCount].executed = false;
		adminWithdrawFundsProposals[adminWithdrawFundsProposalsCount].deadline = now + votingThreshold;
		adminWithdrawFundsProposalsCount++;

		// event
	}

	// MOVE THIS TO HOUSES
	function NFTPurchaseProposal() onlyCurator {

	}



	// ---- finalize proposals ----
	function submitNFTCommission(address _nftAddress, uint _nftId, uint _proposalId) onlyNFTContributor {
		require(_nftAddress != address(0), "must supply non zero nft address");
		// get the receiver
		//address receiver = 
		// transfer the nft
		// transfer payment
	}

	function recoverFailedCommission() public {

	}

	function executeExhibitProposal() public {

	}

	function executeGallerySplitProposal() public {

	}

	//consider security here, is it safe to let anyone complete the approval transfer
	function executeEnterNFTProposal(uint _proposalId) public {
		galleryNFTs[nftProposals[_proposalId].proposer].nftAddressess.push(nftProposals[_proposalId].nftAddress);
		galleryNFTs[nftProposals[_proposalId].proposer].nftIds.push(nftProposals[_proposalId].nftId);
		galleryNFTs[nftProposals[_proposalId].proposer].forSale.push(nftProposals[_proposalId].forSale);
		galleryNFTs[nftProposals[_proposalId].proposer].nftCount++;

		require(nftProposals[_proposalId].yesVotes > votingThreshold, "not enough yes votes");
		require(nftProposals[_proposalId].noVotes < votingThreshold, "no votes are over the votingThreshold");
		require(now < nftProposals[_proposalId].deadline, "deadline has been exceeded for accepting this proposal");
		require(IERC721(nftProposals[_proposalId].nftAddress).transferFrom(nftProposals[_proposalId].proposer, address(this), nftProposals[_proposalId].nftId), "failed to transfer nft");
	}

	function executeWithdrawFundsAdmin() public {

	}


	// ---- actions ----
	function admissionToggle() onlyAdmin {
		if(stillAccepting == true) {
			stillAccepting = false;
		} else {
			stillAccepting = true;
		}
	}

	// all owners can remove their nft
	// maybe lock transfer during exhibits
	function withdrawNFT(address _nftAddress, uint _nftId) public {
		require(IERC721(_nftAddress).ownerOf(_nftId) == address(this), "dao must own the nft");

		galleryNFTProposalCount--;
		require(galleryNFTs[_nftAddress][_nftId] == msg.sender, "sender does not own this nft")
		require(IERC721(_nftAddress).transfer(address(this), msg.sender, _nftId), "failed to transfer nft");

		// event
	}

	// override governance to allow curators to quickly add pieces
	function enterNFTCurator(address _nftAddress, uint _nftId, address _owner, bool _forSale) onlyCurator {
		require(IERC721(_nftAddress).ownerOf(_nftId) == msg.sender, "contributor must own the nft");

		galleryNFTs[_nftAddress][_nftId] = msg.sender;
		galleryNFTProposalCount++;

		require(IERC721(_nftAddress).transferFrom(msg.sender, address(this), _nftId), "failed to transfer nft");
		// event
	}

	function donate(_amount) {
		require(IERC20(wethAddress).transferFrom(msg.sender, address(this), _amount), "transfer failed");
		contributors[msg.sender] = _amount;
	}

	// native token of the dao
	function updateToken() public onlyAdmin {

	}

	function burnCoordinator() public {
		require(msg.sender == initialCoordinator, "only coordinator can remove themselves")
		initialCoordinator = address(0);
	}




	// ----- Exhibits -----

}