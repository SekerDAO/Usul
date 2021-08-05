# TokenWalk-DAO-OS-Contracts

## About

Welcome to TokenWalk's Gnosis Safe DAO Module.

This OS was built with the intention of creating DAO contracts to fit all use cases and levels of trust requirements. These contracts make no opinions about how a DAO should operate to prevent being siloed into a technology choice. The contracts are modular and extensible, built on top of the Gnosis Safe that many already have deployed. The vast majority of state remains on the Gnosis safe which is upgradeable. If new logic is desired on the proposal module a new module may be voted into the Safe by the old proposal module with zero migration overhead. If a DAO decides that they prefer another voting module they can simply undelegate their tokens and continue using the Safe as if this OS never happened.

This works with standard ERC20 tokens rather than only specialized DeFi tokens. Any standard ERC20 token can be used as the fully decentralized token weighted vote. We have specifically chosen not to support ERC721 as a voting token. 

By building on the [Gnosis Safe](https://github.com/gnosis/safe-contracts), this OS allows an organization to start with a trusted federation in the early days and eventually move to a fully decentralized community owned DAO. A Safe admin or federation of owners can be kept as a fail safe mechanism against attacks by bypassing the proposal module and removing it at the Gnosis Safe core if necessary. If this is too trusted, a specific role can be created to only be allowed to cancel proposals. Eventually, given proper community building and token distribution, all Safe admins can be burned and any roles registered that can cancel proposals can be removed.

Roles and membership use a byte code registry that allows DAOs to enable any specific permission that they can think of, remove them later, and stay flexible over time.

### Proposal Module

This is the core module that is registed with the Gnosis Safe. This module operates in a similar way as the [Compound.Finance](https://github.com/compound-finance/compound-protocol/tree/master/contracts/Governance) DAOs with token weighted votes on proposals. These proposals can have a minimum token delegation threshold for being accepted to the contract. Voting is passed by having more votes than the voting threshold and majority of yes votes. Once passed proposals enter a queue period for safety where a trusted role can have time to prevent attacks. All thresholds are updatable by governance proposal or role bypass if desired.

#### Proposal Structure
```
    uint256 value; // Ether value to passed with the call
    uint256 yesVotes; // the total number of YES votes for this proposal
    uint256 noVotes; // the total number of NO votes for this proposal        
    bool executed;
    bool queued;
    uint deadline; // voting deadline
    address proposer;
    bool canceled;
    uint gracePeriod; // queue period for safety
    mapping(address => bool) hasVoted; // mapping voter / delegator to boolean 
    address targetAddress; // The target for execution from the gnosis safe
    bytes data; // The data for the safe to execute
    Enum.Operation operation; // Call or Delegatecall
```

#### Proposal API
```
proposalModule.submitModularProposal
/// @param to The address that the Gnosis Safe targets execution to
/// @param value The Ether value to pass to the execution
/// @param data The data to be executed on the Gnosis Safe
/// @param operation The enumarated call or delegatecall option

proposalModule.startModularQueue
/// @param proposalID The ID of the passed proposal to queue

proposalModule.executeModularProposal
/// @param proposalID The ID of the queued proposal to execute

proposalModule.cancelProposal
/// @param proposalID The ID of the proposal to be canceled by proposer, role bypass, or Safe admin bypass

proposalModule.vote
/// @param proposalID The ID of the proposal to vote on
/// @param vote The boolean value of the vote

proposalModule.endVoting
/// @param proposalID The ID of the proposal to remove the lock on undelegation 
```

### Voting Modules

These are external modules that allow DAOs to choose and change the voting strategy they wish to use. A DAO may start with linear weighted voting and choose swap to quadratic voting or any other strategy they would like to use.

If a delegate has a vote on an active proposal, no delegetors will be able to undelegate until the proposal is passed or canceled. A counter is incremented each time a delegatee votes on a proposal and must be decremented for each time a proposal is finalized.

#### Delegation Structure
```
    mapping(address => uint) votes; // number of tokens held for each delegator
    uint lastBlock; // The last block at which delegation happened to prevent flash loans
    uint total; // The total amount of delegation
    uint proposalCount; // Number of open proposals being voted on
```

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

### Roles Module

This a second GNosis Safe module that defines membership and specific permissions over actions on the Gnosis Safe that bypass the token weighted proposal module. It may be desirable for DAOs to leave specific permission for quick actions that do not need to be brought before the entire community's vote.

This module uses a registry of byte code to enable all possible roles that a DAO can think of in the future.

#### Roles API
```
roles.safeEnterMember
/// @param address The address of the member to add

roles.safeRemoveMember
/// @param address The address of the member to remove

roles.safeAddRole
/// @param address The address of the member to a role to
/// @param Role The role structure contain the allowed bytes to execute

roles.safeRemoveRole
/// @param address The address of the member to remove a role from
/// @param uint The role ID to remove from the member registery

roles.executeModuleByRole
/// @param uint The role ID to use for execution permissions
/// @param address The target address for execution
/// @param uint The ether value to pass during exectution
/// @param bytes The method signature that is allowed by this role
/// @param bytes The parameters data that is allowed by this role
/// @param operation The enumarated call or delegatecall option
```

## Admin Burning

Admin burning is the mechanism by which this OS allows for a gradual move from centralized, to federated, to decentralized.

The process to burn the Gnosis Safe is to remove all owners. Due to the linked list approach that Gnosis uses to remove owners, only the owner added after the previous owner may remove the previous owner. This means that the last owner cannot be removed from the Safe.

To get around this, we remove all owners but the last and place a burn address as the second address and increase the threshold of signers to two. This ensures that there are no known signatures that can reach the threshold.

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
- TW006 "vote module does not exist"
- TW007 "already voted on proposal"
- TW008 "voting on canceled proposal"
- TW009 "voting on executed proposal"
- TW010 "voting on proposal past the deadline"
- TW011 "submit proposal more than one proposal at a time"
- TW012 "submit proposal does not have enough gov tokens"
- TW013 "start queue proposal already entered grace period"
- TW014 "start queue proposal deadline has not passed yet"
- TW015 "execute proposal grace period has not elapsed"
- TW016 "cancel proposal already canceled"
- TW017 "cancel proposal already executed"
- TW018 "cancel proposal already past deadline"
- TW019 "cancel proposal must be originator or Safe"
- TW020 "linear voting: can't undelegate more votes than delegated"
- TW021 "linear voting: cannot vote in the same block as delegation"
- TW022 "must register voting module before submitting a proposal"
- TW023 "only the proposal module may call startVoting and endVoting"
- TW024 "cannot undelegate votes until after timeout"
- TW025 "only the Gnosis Safe may enter Roles function"
- TW026 "must be a member to execute role module"
- TW027 "target address is not authorized for role"
```
