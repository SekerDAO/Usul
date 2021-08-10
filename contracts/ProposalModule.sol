// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./common/Enum.sol";
import "./interfaces/ISafe.sol";
import "./interfaces/IVoting.sol";
import "./interfaces/IRoles.sol";

/// @title Gnosis Safe DAO Proposal Module - A gnosis wallet module for introducing fully decentralized token weighted governance.
/// @author Nathan Ginnever - <team@tokenwalk.com>
contract ProposalModule {
    bytes32 public constant DOMAIN_SEPARATOR_TYPEHASH =
        0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;
    // keccak256(
    //     "EIP712Domain(uint256 chainId,address verifyingContract)"
    // );

    bytes32 public constant TRANSACTION_TYPEHASH =
        0x72e9670a7ee00f5fbf1049b8c38e3f22fab7e9b85029e85cf9412f17fdd5c2ad;
    // keccak256(
    //     "Transaction(address to,uint256 value,bytes data,uint8 operation,uint256 nonce)"
    // );

    struct Proposal {
        uint256 yesVotes; // the total number of YES votes for this proposal
        uint256 noVotes; // the total number of NO votes for this proposal
        bool queued;
        uint256 deadline; // voting deadline
        address proposer;
        bool canceled;
        uint256 gracePeriod; // queue period for safety
        mapping(address => bool) hasVoted; // mapping voter / delegator to boolean
        bool[] executed; // txindexes
        bytes32[] txHashes;
        uint256 executionCounter;
    }

    uint256 private _totalProposalCount;
    uint256 private _proposalTime;
    uint256 private _gracePeriod = 60 seconds; //3 days;
    uint256 private _threshold;
    uint256 private _minimumProposalAmount; // amount of gov tokens needed to participate
    address public immutable executor;
    address private _votingModule;
    address private _roleModule;

    // mapping of proposal id to proposal
    mapping(uint256 => Proposal) public proposals;
    // mapping to track if a user has an open proposal
    mapping(address => bool) private _activeProposal;

    modifier onlyExecutor() {
        require(msg.sender == executor, "TW001");
        _;
    }

    modifier isPassed(uint256 proposalId) {
        require(proposals[proposalId].canceled == false, "TW002");
        require(proposals[proposalId].executionCounter != 0, "TW003");
        require(proposals[proposalId].yesVotes >= _threshold, "TW004");
        require(
            proposals[proposalId].yesVotes >= proposals[proposalId].noVotes,
            "TW005"
        );
        _;
    }

    event ProposalCreated(uint256 number);
    event GracePeriodStarted(uint256 endDate);
    event ProposalExecuted(uint256 id);

    constructor(
        address governanceToken_,
        address executor_,
        uint256 proposalTime_,
        uint256 threshold_,
        uint256 minimumProposalAmount_
    ) {
        executor = executor_;
        _proposalTime = proposalTime_ * 1 minutes; //days;
        _threshold = threshold_;
        _minimumProposalAmount = minimumProposalAmount_;
    }

    // getters
    function threshold() public view virtual returns (uint256) {
        return _threshold;
    }

    function totalProposalCount() public view virtual returns (uint256) {
        return _totalProposalCount;
    }

    function gracePeriod() public view virtual returns (uint256) {
        return _gracePeriod;
    }

    function proposalTime() public view virtual returns (uint256) {
        return _proposalTime;
    }

    function minimumProposalAmount() public view virtual returns (uint256) {
        return _minimumProposalAmount;
    }

    function votingModule() public view virtual returns (address) {
        return _votingModule;
    }

    function registerVoteModule(address module) external onlyExecutor {
        _votingModule = module;
    }

    function registerRoleModule(address module) external onlyExecutor {
        _roleModule = module;
    }

    function vote(uint256 proposalId, bool vote) external {
        if (_roleModule != address(0)) {
            require(IRoles(_roleModule).checkMembership(msg.sender), "TW028");
        }
        require(_votingModule != address(0), "TW006");
        require(proposals[proposalId].hasVoted[msg.sender] == false, "TW007");
        require(proposals[proposalId].canceled == false, "TW008");
        require(proposals[proposalId].deadline >= block.timestamp, "TW010");

        proposals[proposalId].hasVoted[msg.sender] = true;
        IVoting(_votingModule).startVoting(msg.sender);

        if (vote == true) {
            proposals[proposalId].yesVotes =
                proposals[proposalId].yesVotes +
                IVoting(_votingModule).calculateWeight(msg.sender);
        } else {
            proposals[proposalId].noVotes =
                proposals[proposalId].noVotes +
                IVoting(_votingModule).calculateWeight(msg.sender);
        }
    }

    function updateThreshold(uint256 threshold) external onlyExecutor {
        _threshold = threshold;
    }

    function updateMinimumProposalAmount(uint256 minimumProposalAmount)
        external
        onlyExecutor
    {
        _minimumProposalAmount = minimumProposalAmount;
    }

    function updateProposalTime(uint256 newTime) external onlyExecutor {
        _proposalTime = newTime;
    }

    function updateGracePeriod(uint256 gracePeriod) external onlyExecutor {
        _gracePeriod = gracePeriod;
    }

    function submitProposal(bytes32[] memory txHashes) public {
        // TODO: consider mapping here
        for (uint256 i; i < txHashes.length; i++) {
            proposals[_totalProposalCount].executed.push(false);
        }

        require(_votingModule != address(0), "TW022");
        uint256 total = IVoting(_votingModule).calculateWeight(msg.sender);
        require(_activeProposal[msg.sender] == false, "TW011");
        require(total >= _minimumProposalAmount, "TW012");
        IVoting(_votingModule).startVoting(msg.sender);
        proposals[_totalProposalCount].executionCounter = txHashes.length;
        proposals[_totalProposalCount].txHashes = txHashes;
        proposals[_totalProposalCount].yesVotes = total; // the total number of YES votes for this proposal
        proposals[_totalProposalCount].deadline =
            block.timestamp +
            _proposalTime;
        proposals[_totalProposalCount].proposer = msg.sender;
        proposals[_totalProposalCount].hasVoted[msg.sender] = true;

        _activeProposal[msg.sender] = true;
        _totalProposalCount++;
        emit ProposalCreated(_totalProposalCount - 1);
    }

    function startQueue(uint256 proposalId) external isPassed(proposalId) {
        require(proposals[proposalId].deadline <= block.timestamp, "TW014");
        require(proposals[proposalId].canceled == false, "TW023");
        proposals[proposalId].gracePeriod = block.timestamp + _gracePeriod;
        proposals[proposalId].queued = true;
        emit GracePeriodStarted(proposals[proposalId].gracePeriod);
    }

    function executeProposalByIndex(
        uint256 proposalId,
        address target,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 txIndex
    ) external isPassed(proposalId) {
        require(
            block.timestamp >= proposals[proposalId].gracePeriod &&
                proposals[proposalId].gracePeriod != 0,
            "TW015"
        );
        require(proposals[proposalId].executed[txIndex] == false, "TW009");
        bytes32 txHash = getTransactionHash(
            target,
            value,
            data,
            Enum.Operation.Call,
            0
        );
        require(proposals[proposalId].txHashes[txIndex] == txHash, "TW031");
        require(
            txIndex == 0 || proposals[proposalId].executed[txIndex - 1],
            "TW033"
        );
        proposals[proposalId].executed[txIndex] = true;
        proposals[proposalId].executionCounter--;
        if (isProposalFullyExecuted(proposalId)) {
            _activeProposal[proposals[proposalId].proposer] = false;
        }
        ISafe(executor).execTransactionFromModule(
            target,
            value,
            data,
            operation
        );
    }

    function executeProposalBatch(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory data,
        Enum.Operation[] memory operations,
        uint256 startIndex,
        uint256 txCount
    ) external isPassed(proposalId) {
        require(
            block.timestamp >= proposals[proposalId].gracePeriod &&
                proposals[proposalId].gracePeriod != 0,
            "TW015"
        );
        //require(targets.length == values.length && targets.length == signatures.length && targets.length == calldatas.length, "");
        require(
            targets.length == values.length && targets.length == data.length,
            "TW029"
        );
        require(targets.length != 0, "TW030");
        require(
            startIndex == 0 || proposals[proposalId].executed[startIndex - 1],
            "TW034"
        );
        for (uint256 i = startIndex; i < startIndex + txCount; i++) {
            // TODO: allow nonces?
            // TODO: figure out how to keep ordered exectution
            bytes32 txHash = getTransactionHash(
                targets[i],
                values[i],
                data[i],
                Enum.Operation.Call,
                0
            );
            require(proposals[proposalId].txHashes[i] == txHash, "TW032");
            proposals[proposalId].executionCounter--;
            proposals[proposalId].executed[i] = true;
            // todo, dont require, check if successful
            require(
                ISafe(executor).execTransactionFromModule(
                    targets[i],
                    values[i],
                    data[i],
                    operations[i]
                )
            );
        }
        if (isProposalFullyExecuted(proposalId)) {
            _activeProposal[proposals[proposalId].proposer] = false;
        }
    }

    function isProposalFullyExecuted(uint256 proposalId)
        public
        view
        returns (bool)
    {
        if (proposals[proposalId].executionCounter == 0) {
            return true;
        } else {
            return false;
        }
    }

    function cancelProposal(uint256 proposalId) external {
        require(proposals[proposalId].canceled == false, "TW016");
        require(proposals[proposalId].executionCounter > 0, "TW017");
        // proposal guardian can be put in the roles module
        require(
            proposals[proposalId].proposer == msg.sender ||
                msg.sender == executor,
            "TW019"
        );
        proposals[proposalId].canceled = true;
        _activeProposal[proposals[proposalId].proposer] = false;
    }

    /// @dev Generates the data for the module transaction hash (required for signing)
    function generateTransactionHashData(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 nonce
    ) public view returns (bytes memory) {
        uint256 chainId = getChainId();
        bytes32 domainSeparator = keccak256(
            abi.encode(DOMAIN_SEPARATOR_TYPEHASH, chainId, this)
        );
        bytes32 transactionHash = keccak256(
            abi.encode(
                TRANSACTION_TYPEHASH,
                to,
                value,
                keccak256(data),
                operation,
                nonce
            )
        );
        return
            abi.encodePacked(
                bytes1(0x19),
                bytes1(0x01),
                domainSeparator,
                transactionHash
            );
    }

    function getTransactionHash(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 nonce
    ) public view returns (bytes32) {
        return
            keccak256(
                generateTransactionHashData(to, value, data, operation, nonce)
            );
    }

    /// @dev Returns the chain id used by this contract.
    function getChainId() public view returns (uint256) {
        uint256 id;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            id := chainid()
        }
        return id;
    }
}
