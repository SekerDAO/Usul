# TokenWalk - Seele Module

<p align="center">
  <img width="600" src="https://pbs.twimg.com/media/Ezw7YFqWEAMgqUl.jpg">
</p>

## About

Welcome to the [Zodiac](https://github.com/gnosis/zodiac) Seele Module.

This module is another tool in the Zodiac DAO technology stack. This module provides a proposal core that can take swappable voting contracts, allowing DAOs to choose different on-chain voting methods that best suit their needs.

The available voting methods as of this time are...
- ERC20 delegation
- Compound ERC20 delegation
- Quadratic Voting + Membership
- Single Voting
- Commitment Voting

### Proposal Core

This is the core of the module that is registered with the Gnosis Safe as a Zodiac module. This module is agnostic to voting as voting is done with separate contracts that can be registered with the proposal core. These proposals use the time-boxed standard method with thresholds to pass. It is similar to [Reality](https://github.com/gnosis/zodiac-module-reality) (formerly SafeSnap) in that it can take a list of transaction hashes and execute them after proposal. This module adds a batching feature to the execution phase.

#### Proposal Structure
```
uint256 value; // Ether value to passed with the call
uint256 yesVotes; // the total number of YES votes for this proposal
uint256 noVotes; // the total number of NO votes for this proposal        
bool executed; // Marks when a proposal is fully executed
bool queued; // Marks when the proposal has entered SafeDelay (a gnosis module)
uint deadline; // voting deadline
address proposer; // the originator of the proposal
bool canceled; // canceled by the gnosis safe bypass or the originator
uint gracePeriod; // queue period for safety
mapping(address => bool) hasVoted; // mapping voter / delegator to boolean 
bool[] executed; // transaction indices of execution booleans
bytes32[] txHashes; // the hashes of transactions to be executed
uint256 executionCounter; // counting down until the proposal is fully executed
```

#### Proposal API
```
/// @dev The entry point for submitting transaction proposals
proposalModule.submitProposal
/// @param txHashes The array of transaction hashes to be executed

/// @dev Entry point to start the delay period of a proposal
proposalModule.startQueue
/// @param proposalID The ID of the passed proposal to queue

/// @dev The execution of a transaction contained within a passed proposal
proposalModule.executeProposalByIndex
/// @param proposalID The ID of the queued proposal to execute
/// @param target The address that the Gnosis Safe targets execution to
/// @param value The Ether value to pass to the execution
/// @param data The data to be executed on the Gnosis Safe
/// @param operation The enumarated call or delegatecall option
/// @param txIndex the index of the transaction to be executed in proposal.txHashes array

/// @dev This performs a batch of transaction executions in one ethereum transaction
proposalModule.executeProposalBatch
/// @param proposalID The ID of the queued proposal to execute
/// @param targets The array of address that the Gnosis Safe targets execution to
/// @param values The array of Ether value to pass to the execution
/// @param datas The array of datas to be executed on the Gnosis Safe
/// @param operations The array of enumarated call or delegatecall option
/// @param startIndex The starting index of the transaction to be executed in proposal.txHashes array
/// @param txCount The number of transactions to be executed in this batch

/// @dev The originator of the proposal or a special role granted to the Safe can cancel 
proposalModule.cancelProposal
/// @param proposalID The ID of the proposal to be canceled by proposer, role bypass, or Safe admin bypass

/// @dev A view that returns if all transactions have been executed in a proposal
proposalModule.isProposalFullyExecuted
/// @param proposalId the id of the proposal that you would like see is fully executed or not

/// @dev A view to that returns the transaction for given transaction data
proposalModule.generateTransactionHashData
/// @param target The address that the Gnosis Safe targets execution to
/// @param value The Ether value to pass to the execution
/// @param data The data to be executed on the Gnosis Safe
/// @param operation The enumarated call or delegatecall option
```

### Voting Cores

These are external contracts registered with the Seele module that allow DAOs to choose and change the voting strategy they wish to use. A DAO may start with linear weighted voting and then swap to quadratic voting or any other strategy they would like to use.

If a delegate has a vote on an active proposal, no delegetors will be able to undelegate until the proposal is passed or canceled. A counter is incremented each time a delegatee votes on a proposal and must be decremented for each time a proposal is finalized. An optional delay to the ability of undelegating votes can be supplied to this contract.

#### Delegation Voting
```
mapping(address => uint) votes; // number of tokens held for each delegator
uint lastBlock; // The last block at which delegation happened to prevent flash loans
uint total; // The total amount of delegation
uint proposalCount; // Number of open proposals being voted on
```

#### Quadtratic Voting

#### Single (Member) Voting

#### Commitment Voting

#### Voting API
```
voting.delegateVotes
/// @param delegatee The account that is being delegated tokens to
/// @param amount The amount of tokens to delegate

voting.undelegateVotes
/// @param delegatee The account that is being undelegated tokens from
/// @param amount The amount of tokens to undelegate

voting.calculateWeight
/// @param delegatee The account that is to have the voting weight delegated from by voting method
```

## Deploy 

```
- Proxy Factory
- Safe Singleton
- factory.createProxy(signleton, '0x') // TODO: use with salt
- safe = Safe.attach(proxy)
- safe.setup([owners])
- ERC20 Governance token
- token.transfer(safe, (1-foundersPortion))
- Deploy Proposal Module
- Deploy Desired Voting Module
- Deploy Roles module (if desired)
- safe.executeContractCallWithSigners(safe, safe, "registerModule", [Proposal.address])
- safe.executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [voteModule.address])
- safe.executeContractCallWithSigners(safe, safe, "registerModule", [Roles.address])
``` 

## Error Codes
```
- TW001 "only gnosis safe may enter"
- TW002 "proposal was canceled"
- TW003 "proposal already executed"
- TW004 "proposal does not meet vote threshold"
- TW005 "no votes outweigh yes"
- TW007 "already voted on proposal"
- TW008 "voting on canceled proposal"
- TW009 "cannot execute transaction again"
- TW010 "voting on proposal past the deadline"
- TW011 "submit proposal more than one proposal at a time"
- TW013 "start queue proposal already entered grace period"
- TW014 "start queue proposal deadline has not passed yet"
- TW015 "execute proposal grace period has not elapsed"
- TW016 "cancel proposal already canceled"
- TW017 "cancel proposal already executed"
- TW018 "proposal exceeds max execution limit"
- TW019 "cancel proposal must be originator or Safe"
- TW020 "linear voting: can't undelegate more votes than delegated"
- TW021 "linear voting: cannot vote in the same block as delegation"
- TW023 "only the proposal module may call startVoting and endVoting"
- TW024 "cannot undelegate votes until after timeout"
- TW025 "only the Gnosis Safe may enter Roles function"
- TW026 "must be a member to execute role module"
- TW027 "target address is not authorized for role"
- TW028 "must be a member to vote"
- TW029 "length of proposal execution data missmatch"
- TW030 "proposal must contain at least one execution"
- TW031 "unexpected transaction hash"
- TW032 "unexpected transaction hash - batch"
- TW033 "previous tx not executed single"
- TW034 "previous tx not executed batch"
- TW035 "delegate has no votes"
```
