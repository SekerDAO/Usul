// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity ^0.8.6;

import "@gnosis.pm/zodiac/contracts/core/Module.sol";

/// @title Seele Module - A Zodiac module that enables a voting agnostic proposal mechanism.
/// @author Nathan Ginnever - <team@tokenwalk.org>
contract ProposalModule is Module {
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

    /**
     * @dev Supported vote types. Matches Governor Bravo ordering.
     */
    enum VoteType {
        Against,
        For,
        Abstain
    }

    struct Proposal {
        uint256 yesVotes; // the total number of YES votes for this proposal
        uint256 noVotes; // the total number of NO votes for this proposal
        uint256 abstainVotes; // introduce abstain votes
        bool queued;
        uint256 deadline; // voting deadline TODO: consider using block number
        address proposer;
        bool canceled;
        uint256 gracePeriod; // queue period for safety
        mapping(address => bool) hasVoted; // mapping voter / delegator to boolean
        bool[] executed; // txindexes
        bytes32[] txHashes;
        uint256 executionCounter;
        address votingStrategy; // the module that is allowed to vote on this
    }

    uint256 public totalProposalCount;
    uint256 public proposalWindow;
    uint256 public gracePeriod = 60 seconds; //3 days; TODO: Remove and use the Zodiac Delay modifier
    uint256 public threshold;
    address internal constant SENTINEL_STRATEGY = address(0x1);

    // mapping of proposal id to proposal
    mapping(uint256 => Proposal) public proposals;
    // mapping to track if a user has an open proposal
    mapping(address => bool) public activeProposal;
    // Mapping of modules
    mapping(address => address) internal strategies;

    modifier onlyExecutor() {
        require(msg.sender == avatar, "TW001");
        _;
    }

    modifier strategyOnly() {
        require(strategies[msg.sender] != address(0), "Strategy not authorized");
        _;
    }

    modifier isPassed(uint256 proposalId) {
        require(proposals[proposalId].canceled == false, "TW002");
        require(proposals[proposalId].executionCounter != 0, "TW003");
        require(proposals[proposalId].yesVotes >= threshold, "TW004");
        require(
            proposals[proposalId].yesVotes >= proposals[proposalId].noVotes,
            "TW005"
        );
        _;
    }

    event ProposalCreated(uint256 number);
    event GracePeriodStarted(uint256 endDate);
    event ProposalExecuted(uint256 id);
    event SeeleSetup(address indexed initiator, uint256 indexed proposalWindow, uint256 indexed threshold);
    event EnabledStrategy(address strategy);
    event DisabledStrategy(address strategy);

    // move threshold to voting contracts
    constructor(uint256 _proposalWindow, uint256 _threshold) {
        bytes memory initParams = abi.encode(_proposalWindow, _threshold);
        setUp(initParams);
    }

    function setUp(bytes memory initParams) public override {
        (uint256 _proposalWindow, uint256 _threshold) = abi.decode(initParams, (uint256, uint256));
        __Ownable_init();
        require(_proposalWindow >= 1, "proposal window must be greater than 1");
        proposalWindow = _proposalWindow * 1 minutes; //days;
        threshold = _threshold;
        setupStrategies();
        emit SeeleSetup(msg.sender, _proposalWindow, _threshold);
    }

    function setupStrategies() internal {
        require(
            strategies[SENTINEL_STRATEGY] == address(0),
            "setUpModules has already been called"
        );
        strategies[SENTINEL_STRATEGY] = SENTINEL_STRATEGY;
    }

    /// @dev Disables a voting strategy on the module
    /// @param prevStrategy Strategy that pointed to the module to be removed in the linked list
    /// @param strategy Strategy to be removed
    /// @notice This can only be called by the owner
    function disableStrategy(address prevStrategy, address strategy)
        public
        onlyOwner
    {
        require(
            strategy != address(0) && strategy != SENTINEL_STRATEGY,
            "Invalid strategy"
        );
        require(strategies[prevStrategy] == strategy, "Strategy already disabled");
        strategies[prevStrategy] = strategies[strategy];
        strategies[strategy] = address(0);
        emit DisabledStrategy(strategy);
    }

    /// @dev Enables a voting strategy that can add transactions to the queue
    /// @param strategy Address of the module to be enabled
    /// @notice This can only be called by the owner
    function enableStrategy(address strategy) public onlyOwner {
        require(
            strategy != address(0) && strategy != SENTINEL_STRATEGY,
            "Invalid strategy"
        );
        require(strategies[strategy] == address(0), "Strategy already enabled");
        strategies[strategy] = strategies[SENTINEL_STRATEGY];
        strategies[SENTINEL_STRATEGY] = strategy;
        emit EnabledStrategy(strategy);
    }

    /// @dev Returns if an module is enabled
    /// @return True if the module is enabled
    function isStrategyEnabled(address _strategy) public view returns (bool) {
        return SENTINEL_STRATEGY != _strategy && strategies[_strategy] != address(0);
    }

    /// @dev Returns array of modules.
    /// @param start Start of the page.
    /// @param pageSize Maximum number of modules that should be returned.
    /// @return array Array of modules.
    /// @return next Start of the next page.
    function getStrategiesPaginated(address start, uint256 pageSize)
        external
        view
        returns (address[] memory array, address next)
    {
        // Init array with max page size
        array = new address[](pageSize);

        // Populate return array
        uint256 strategyCount = 0;
        address currentStrategy = strategies[start];
        while (
            currentStrategy != address(0x0) &&
            currentStrategy != SENTINEL_STRATEGY &&
            strategyCount < pageSize
        ) {
            array[strategyCount] = currentStrategy;
            currentStrategy = strategies[currentStrategy];
            strategyCount++;
        }
        next = currentStrategy;
        // Set correct size of returned array
        // solhint-disable-next-line no-inline-assembly
        assembly {
            mstore(array, strategyCount)
        }
    }

    function isExecuted(uint256 proposalId, uint256 index)
        public
        view
        returns (bool)
    {
        return proposals[proposalId].executed[index];
    }

    function getTxHash(uint256 proposalId, uint256 index)
        public
        view
        returns (bytes32)
    {
        return proposals[proposalId].txHashes[index];
    }

    /**
     * @dev See {IGovernor-hasVoted}.
     */
    function hasVoted(uint256 proposalId, address account) public view returns (bool) {
        return proposals[proposalId].hasVoted[account];
    }

    function receiveVote(
        address voter,
        uint256 proposalId,
        bool vote,
        uint256 weight
    ) external strategyOnly {
        require(msg.sender == proposals[proposalId].votingStrategy, "vote from incorrect strategy");
        require(proposals[proposalId].hasVoted[voter] == false, "TW007");
        require(proposals[proposalId].canceled == false, "TW008");
        require(proposals[proposalId].deadline >= block.timestamp, "TW010");

        proposals[proposalId].hasVoted[voter] = true;

        if (vote == true) {
            proposals[proposalId].yesVotes =
                proposals[proposalId].yesVotes +
                weight;
        } else {
            proposals[proposalId].noVotes =
                proposals[proposalId].noVotes +
                weight;
        }
    }

    function getProposalWindow() public view returns (uint256) {
        return proposalWindow;
    }

    function updateThreshold(uint256 threshold) external onlyExecutor {
        threshold = threshold;
    }

    function updateproposalWindow(uint256 newWindow) external onlyExecutor {
        proposalWindow = newWindow;
    }

    function updateGracePeriod(uint256 gracePeriod) external onlyExecutor {
        gracePeriod = gracePeriod;
    }

    function submitProposal(bytes32[] memory txHashes, address votingStrategy) public {
        require(isStrategyEnabled(votingStrategy), "voting strategy is not enabled for proposal");
        // TODO: consider mapping here
        for (uint256 i; i < txHashes.length; i++) {
            proposals[totalProposalCount].executed.push(false);
        }
        require(activeProposal[msg.sender] == false, "TW011");
        proposals[totalProposalCount].executionCounter = txHashes.length;
        proposals[totalProposalCount].txHashes = txHashes;
        proposals[totalProposalCount].deadline = block.timestamp + proposalWindow;
        proposals[totalProposalCount].proposer = msg.sender;
        proposals[totalProposalCount].votingStrategy = votingStrategy;
        activeProposal[msg.sender] = true;
        totalProposalCount++;
        emit ProposalCreated(totalProposalCount - 1);
    }

    function startQueue(uint256 proposalId) external isPassed(proposalId) {
        require(proposals[proposalId].deadline <= block.timestamp, "TW014");
        require(proposals[proposalId].canceled == false, "TW023");
        proposals[proposalId].gracePeriod = block.timestamp + gracePeriod;
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
            activeProposal[proposals[proposalId].proposer] = false;
        }
        exec(target, value, data, operation);
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
            require(exec(targets[i], values[i], data[i], operations[i]));
        }
        if (isProposalFullyExecuted(proposalId)) {
            activeProposal[proposals[proposalId].proposer] = false;
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
                msg.sender == avatar,
            "TW019"
        );
        proposals[proposalId].canceled = true;
        activeProposal[proposals[proposalId].proposer] = false;
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
