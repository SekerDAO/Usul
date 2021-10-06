// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity >=0.8.0;

import "@gnosis.pm/zodiac/contracts/core/Module.sol";
import "./interfaces/IStrategy.sol";

/// @title Seele Module - A Zodiac module that enables a voting agnostic proposal mechanism.
/// @author Nathan Ginnever - <team@tokenwalk.org>
contract Seele is Module {
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

    enum ProposalState {
        Active,
        Canceled,
        TimeLocked,
        Executed,
        Executing,
        Expired
    }

    struct Proposal {
        address proposer;
        bool canceled;
        bool successful;
        uint256 timeLockPeriod; // queue period for safety
        bool[] executed; // maybe can be derived from counter
        bytes32[] txHashes;
        uint256 executionCounter;
        address votingStrategy; // the module that is allowed to vote on this
    }

    uint256 public totalProposalCount; // total number of submitted proposals
    //uint256 public expiry; // time after which execution of a proposals is not valid
    uint256 public timeLockPeriod; // 3 days; // consider leaving this up to each strat
    address internal constant SENTINEL_STRATEGY = address(0x1);

    // mapping of proposal id to proposal
    mapping(uint256 => Proposal) public proposals;
    // Mapping of modules
    mapping(address => address) internal strategies;

    modifier onlyAvatar() {
        require(msg.sender == avatar, "only the avatar may enter");
        _;
    }

    modifier strategyOnly() {
        require(
            strategies[msg.sender] != address(0),
            "Strategy not authorized"
        );
        _;
    }

    event ProposalCreated(address strategy, uint256 proposalNumber);
    event TransactionExecuted(bytes32 txHash);
    event TransactionExecutedBatch(uint256 startIndex, uint256 endIndex);
    event TimeLockPeriodStarted(uint256 endDate);
    event TimeLockUpdated(uint256 newTimeLockPeriod);
    event ProposalExecuted(uint256 id);
    event SeeleSetup(
        address indexed initiator,
        address indexed owner,
        address indexed avatar,
        address target
    );
    event EnabledStrategy(address strategy);
    event DisabledStrategy(address strategy);

    // move threshold to voting contracts
    constructor(
        address _owner,
        address _avatar,
        address _target,
        uint256 _timeLockPeriod
    ) {
        bytes memory initParams = abi.encode(
            _owner,
            _avatar,
            _target,
            _timeLockPeriod
        );
        setUp(initParams);
    }

    function setUp(bytes memory initParams) public override {
        (
            address _owner,
            address _avatar,
            address _target,
            uint256 _timeLockPeriod
        ) = abi.decode(initParams, (address, address, address, uint256));
        __Ownable_init();
        require(_owner != address(0), "Avatar can not be zero address");
        require(_avatar != address(0), "Avatar can not be zero address");
        require(_target != address(0), "Target can not be zero address");
        avatar = _avatar;
        target = _target;
        timeLockPeriod = _timeLockPeriod * 1 seconds;
        setupStrategies();
        transferOwnership(_owner);
        emit SeeleSetup(msg.sender, _owner, _avatar, _target);
    }

    function setupStrategies() internal {
        require(
            strategies[SENTINEL_STRATEGY] == address(0),
            "setUpModules has already been called"
        );
        strategies[SENTINEL_STRATEGY] = SENTINEL_STRATEGY;
    }

    /// @dev Disables a voting strategy on the module
    /// @param prevStrategy Strategy that pointed to the strategy to be removed in the linked list
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
        require(
            strategies[prevStrategy] == strategy,
            "Strategy already disabled"
        );
        strategies[prevStrategy] = strategies[strategy];
        strategies[strategy] = address(0);
        emit DisabledStrategy(strategy);
    }

    /// @dev Enables a voting strategy that can vote on proposals
    /// @param strategy Address of the strategy to be enabled
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

    /// @dev Returns if a strategy is enabled
    /// @return True if the strategy is enabled
    function isStrategyEnabled(address _strategy) public view returns (bool) {
        return
            SENTINEL_STRATEGY != _strategy &&
            strategies[_strategy] != address(0);
    }

    /// @dev Returns array of strategy.
    /// @param start Start of the page.
    /// @param pageSize Maximum number of strategy that should be returned.
    /// @return array Array of strategy.
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

    /// @dev Returns true if a proposal transaction by index is exectuted.
    /// @param proposalId the proposal to inspect.
    /// @param index the transaction to inspect.
    /// @return boolean.
    function isTxExecuted(uint256 proposalId, uint256 index)
        public
        view
        returns (bool)
    {
        return proposals[proposalId].executed[index];
    }

    /// @dev Returns the hash of a transaction in a proposal.
    /// @param proposalId the proposal to inspect.
    /// @param index the transaction to inspect.
    /// @return transaction hash.
    function getTxHash(uint256 proposalId, uint256 index)
        public
        view
        returns (bytes32)
    {
        return proposals[proposalId].txHashes[index];
    }

    /// @dev Updates the grace period time after a proposal passed before it can execute.
    /// @param newTimeLockPeriod the new delay before execution.
    function updateTimeLockPeriod(uint256 newTimeLockPeriod)
        external
        onlyAvatar
    {
        timeLockPeriod = newTimeLockPeriod;
        emit TimeLockUpdated(newTimeLockPeriod);
    }

    /// @dev Submits a new proposal.
    /// @param txHashes an array of hashed transaction data to execute
    /// @param votingStrategy the voting strategy to be used with this proposal
    /// @param data any extra data to pass to the voting strategy
    function submitProposal(
        bytes32[] memory txHashes,
        address votingStrategy,
        bytes memory data
    ) external {
        require(
            isStrategyEnabled(votingStrategy),
            "voting strategy is not enabled for proposal"
        );
        for (uint256 i; i < txHashes.length; i++) {
            proposals[totalProposalCount].executed.push(false);
        }
        proposals[totalProposalCount].executionCounter = txHashes.length;
        proposals[totalProposalCount].txHashes = txHashes;
        proposals[totalProposalCount].proposer = msg.sender;
        proposals[totalProposalCount].votingStrategy = votingStrategy;
        totalProposalCount++;
        IStrategy(votingStrategy).receiveProposal(totalProposalCount - 1, data);
        emit ProposalCreated(votingStrategy, totalProposalCount - 1);
    }

    /// @dev Cancels a proposal.
    /// @param proposalId the proposal to cancel.
    function cancelProposal(uint256 proposalId) external {
        Proposal storage _proposal = proposals[proposalId];
        require(_proposal.executionCounter > 0, "nothing to cancel");
        require(_proposal.canceled == false, "proposal is already canceled");
        // proposal guardian can be put in the roles module
        require(
            _proposal.proposer == msg.sender || msg.sender == avatar,
            "cancel proposal from non-owner or governance"
        );
        _proposal.canceled = true;
    }

    /// @dev Begins the timelock phase of a successful proposal
    /// @param proposalId the identifier of the proposal
    function receiveStrategy(uint256 proposalId) external strategyOnly {
        require(
            state(proposalId) == ProposalState.Active,
            "cannot start timelock, proposal is not active"
        );
        require(
            msg.sender == proposals[proposalId].votingStrategy,
            "cannot start timelock, incorrect strategy"
        );
        proposals[proposalId].timeLockPeriod = block.timestamp + timeLockPeriod;
        proposals[proposalId].successful = true;
        emit TimeLockPeriodStarted(proposals[proposalId].timeLockPeriod);
    }

    /// @dev Executes a transaction inside of a proposal.
    /// @notice Transactions must be called in ascending index order
    /// @param proposalId the identifier of the proposal
    /// @param target the contract to be called by the avatar
    /// @param value ether value to pass with the call
    /// @param data the data to be executed from the call
    /// @param operation Call or Delegatecall
    /// @param txIndex the index of the transaction to execute
    function executeProposalByIndex(
        uint256 proposalId,
        address target,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 txIndex
    ) public {
        require(
            state(proposalId) == ProposalState.Executing,
            "proposal is not in execution state"
        );
        require(
            proposals[proposalId].executed[txIndex] == false,
            "transaction is already executed"
        );
        bytes32 txHash = getTransactionHash(
            target,
            value,
            data,
            Enum.Operation.Call,
            0
        );
        require(
            proposals[proposalId].txHashes[txIndex] == txHash,
            "transaction hash does not match indexed hash"
        );
        require(
            txIndex == 0 || proposals[proposalId].executed[txIndex - 1],
            "transaction is not in ascending order of execution"
        );
        proposals[proposalId].executed[txIndex] = true;
        proposals[proposalId].executionCounter--;
        require(exec(target, value, data, operation));
        emit TransactionExecuted(txHash);
    }

    /// @dev Executes batches of transactions inside of a proposal.
    /// @notice Transactions must be called in ascending index order
    /// @param proposalId the identifier of the proposal
    /// @param targets the contracts to be called by the avatar
    /// @param values ether values to pass with the calls
    /// @param data the data to be executed from the calls
    /// @param operations Calls or Delegatecalls
    /// @param startIndex the start index of the transactions to execute
    /// @param txCount the number of txs to execute in this batch
    function executeProposalBatch(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory data,
        Enum.Operation[] memory operations,
        uint256 startIndex,
        uint256 txCount
    ) external {
        require(
            targets.length == values.length && targets.length == data.length,
            "execution parameters missmatch"
        );
        require(
            targets.length != 0,
            "no transactions to execute supplied to batch"
        );
        require(
            startIndex == 0 || proposals[proposalId].executed[startIndex - 1],
            "starting from an index out of ascending order"
        );
        for (uint256 i = startIndex; i < startIndex + txCount; i++) {
            // TODO: allow nonces?
            executeProposalByIndex(
                proposalId,
                targets[i],
                values[i],
                data[i],
                operations[i],
                i
            );
        }
        emit TransactionExecutedBatch(startIndex, startIndex + txCount);
    }

    /// @dev Get the state of a proposal
    /// @param proposalId the identifier of the proposal
    /// @return ProposalState the enum of the state of the proposal
    function state(uint256 proposalId) public view returns (ProposalState) {
        Proposal storage _proposal = proposals[proposalId];
        if (_proposal.executionCounter == 0) {
            return ProposalState.Executed;
        } else if (_proposal.canceled) {
            return ProposalState.Canceled;
        } else if (_proposal.timeLockPeriod == 0) {
            return ProposalState.Active;
        } else if (block.timestamp < _proposal.timeLockPeriod) {
            return ProposalState.TimeLocked;
        } else if (block.timestamp >= _proposal.timeLockPeriod) {
            return ProposalState.Executing;
        } else {
            revert("unknown proposal id state");
        }
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
