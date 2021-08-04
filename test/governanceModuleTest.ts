import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { ethers, network, waffle } from 'hardhat'
import { DAOFixture, getFixtureWithParams } from './shared/fixtures'
import { executeContractCallWithSigners, buildContractCall, safeSignMessage, executeTx } from './shared/utils'
import { keccak256 } from 'ethereumjs-util'
import { defaultSender, provider, web3, contract } from '@openzeppelin/test-environment';
import { AddressZero } from "@ethersproject/constants";

const zero = ethers.BigNumber.from(0)
const MaxUint256 = ethers.constants.MaxUint256

let daoFixture: DAOFixture
let wallet: SignerWithAddress

describe('proposalModule:', () => {
  const [wallet_0, wallet_1, wallet_2, wallet_3] = waffle.provider.getWallets();
  beforeEach(async function () {
    wallet = (await ethers.getSigners())[0]
    daoFixture = await getFixtureWithParams(wallet, true)
  })

  // can use the safe and a cancel proposal role 

  it('TokenWalk OS is initialized', async () => {
    const { proposalModule, linearVoting, safe, govToken, weth } = daoFixture
    expect(await proposalModule.safe()).to.equal(safe.address)
    expect(await govToken.balanceOf(safe.address)).to.equal('50000000000000000000000')
    expect(await proposalModule.totalProposalCount()).to.equal(0)
    expect(await proposalModule.proposalTime()).to.equal(60)
    expect(await proposalModule.gracePeriod()).to.equal(60)
    expect(await proposalModule.threshold()).to.equal('1000000000000000000')
    expect(await linearVoting.governanceToken()).to.equal(govToken.address)
  })

  it('can register Safe proposal engine module', async () => {
    const { proposalModule, safe } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    expect(await safe.isModuleEnabled(proposalModule.address)).to.equal(true)
  })

  it('can register linear voting module', async () => {
    const { proposalModule, linearVoting, safe } = daoFixture
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    expect(await proposalModule.votingModule()).to.equal(linearVoting.address)
  })

  it.skip('only Safe can register linear voting module', async () => {
    const { proposalModule, linearVoting } = daoFixture
    await proposalModule.registerVoteModule(linearVoting.address)
  })

  it('can delegate votes to self', async () => {
    const { proposalModule, linearVoting, safe, govToken, weth } = daoFixture
    const bal = await govToken.balanceOf(wallet_0.address)
    await govToken.approve(linearVoting.address, 1000)
    await linearVoting.delegateVotes(wallet_0.address, 1000)
    const delegatation = await linearVoting.delegations(wallet_0.address)
    expect(delegatation.total).to.equal(1000)
    expect(await govToken.balanceOf(linearVoting.address)).to.equal(1000)
  })

  it('can undelegate votes to self', async () => {
    const { proposalModule, linearVoting, safe, govToken, weth } = daoFixture
    const bal = await govToken.balanceOf(wallet_0.address)
    await govToken.approve(linearVoting.address, 1000)
    await linearVoting.delegateVotes(wallet_0.address, 1000)
    const delegatation = await linearVoting.delegations(wallet_0.address)
    expect(delegatation.total).to.equal(1000)
    expect(await govToken.balanceOf(linearVoting.address)).to.equal(1000)
    await linearVoting.undelegateVotes(wallet_0.address, 1000)
    const undelegatation = await linearVoting.delegations(wallet_0.address)
    expect(undelegatation.total).to.equal(0)
    expect(await govToken.balanceOf(linearVoting.address)).to.equal(0)
  })

  it('can delegate votes to others', async () => {
    const { proposalModule, linearVoting, safe, govToken, weth } = daoFixture
    const bal = await govToken.balanceOf(wallet_0.address)
    await govToken.approve(linearVoting.address, 1000)
    await linearVoting.delegateVotes(wallet_0.address, 1000)
    await govToken.connect(wallet_1).approve(linearVoting.address, 1000)
    await linearVoting.connect(wallet_1).delegateVotes(wallet_0.address, 1000)
    await govToken.connect(wallet_2).approve(linearVoting.address, 1000)
    await linearVoting.connect(wallet_2).delegateVotes(wallet_0.address, 1000)
    const delegatation = await linearVoting.delegations(wallet_0.address)
    expect(delegatation.total).to.equal(3000)
    expect(await govToken.balanceOf(linearVoting.address)).to.equal(3000)
  })

  it('can undelegate votes to others', async () => {
    const { proposalModule, linearVoting, safe, govToken, weth } = daoFixture
    const bal = await govToken.balanceOf(wallet_0.address)
    await govToken.approve(linearVoting.address, 1000)
    await linearVoting.delegateVotes(wallet_0.address, 1000)
    await govToken.connect(wallet_1).approve(linearVoting.address, 1000)
    await linearVoting.connect(wallet_1).delegateVotes(wallet_0.address, 1000)
    await govToken.connect(wallet_2).approve(linearVoting.address, 1000)
    await linearVoting.connect(wallet_2).delegateVotes(wallet_0.address, 1000)
    const delegatation = await linearVoting.delegations(wallet_0.address)
    expect(delegatation.total).to.equal(3000)
    expect(await govToken.balanceOf(linearVoting.address)).to.equal(3000)
    await linearVoting.connect(wallet_2).undelegateVotes(wallet_0.address, 1000)
    const undelegatation = await linearVoting.delegations(wallet_0.address)
    expect(undelegatation.total).to.equal(2000)
    expect(await govToken.balanceOf(linearVoting.address)).to.equal(2000)
  })

  it('can execute add safe admin DAO proposal', async () => {
    const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    await govToken.approve(linearVoting.address, ethers.BigNumber.from('1000000000000000000'))
    await linearVoting.delegateVotes(wallet_0.address, ethers.BigNumber.from('1000000000000000000'))
    let addCall = buildContractCall(safe, "addOwnerWithThreshold", [wallet_2.address, 1], await safe.nonce())
    await proposalModule.submitModularProposal(safe.address, 0, addCall.data)
    let proposal = await proposalModule.proposals(0)
    expect(proposal.value).to.equal(0)
    expect(proposal.yesVotes).to.equal(ethers.BigNumber.from('1000000000000000000'))
    expect(proposal.noVotes).to.equal(0)
    expect(proposal.proposer).to.equal(wallet_0.address)
    expect(proposal.canceled).to.equal(false)
    expect(proposal.targetAddress).to.equal(safe.address)
    expect(proposal.data).to.equal(addCall.data)
    await network.provider.send("evm_increaseTime", [60])
    await proposalModule.startModularQueue(0)
    proposal = await proposalModule.proposals(0)
    expect(proposal.queued).to.equal(true)
    await network.provider.send("evm_increaseTime", [60])
    await proposalModule.executeModularProposal(0)
    proposal = await proposalModule.proposals(0)
    expect(proposal.executed).to.equal(true)
    const owners = await safe.getOwners()
    expect(owners[0]).to.equal(wallet_2.address)
    expect(owners[1]).to.equal(wallet_0.address)
  })

  it.skip('cannot create proposal with out delegation threshold', async () => {
    const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    let addCall = buildContractCall(safe, "addOwnerWithThreshold", [wallet_2.address, 1], await safe.nonce())
    await proposalModule.submitModularProposal(safe.address, 0, addCall.data)
  })

  it('can vote past the threshold with delegation', async () => {
    const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    await govToken.approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    await govToken.connect(wallet_1).approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.connect(wallet_1).delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    let addCall = buildContractCall(safe, "addOwnerWithThreshold", [wallet_2.address, 1], await safe.nonce())
    await proposalModule.submitModularProposal(safe.address, 0, addCall.data)
    let proposal = await proposalModule.proposals(0)
    expect(proposal.value).to.equal(0)
    expect(proposal.yesVotes).to.equal(ethers.BigNumber.from('1000000000000000000'))
    expect(proposal.noVotes).to.equal(0)
    expect(proposal.proposer).to.equal(wallet_0.address)
    expect(proposal.canceled).to.equal(false)
    expect(proposal.targetAddress).to.equal(safe.address)
    expect(proposal.data).to.equal(addCall.data)
    await network.provider.send("evm_increaseTime", [60])
    await proposalModule.startModularQueue(0)
    proposal = await proposalModule.proposals(0)
    expect(proposal.queued).to.equal(true)
    await network.provider.send("evm_increaseTime", [60])
    await proposalModule.executeModularProposal(0)
    proposal = await proposalModule.proposals(0)
    expect(proposal.executed).to.equal(true)
    const owners = await safe.getOwners()
    expect(owners[0]).to.equal(wallet_2.address)
    expect(owners[1]).to.equal(wallet_0.address)
  })

  it.skip('can vote in same block as delegatation', async () => {
    const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    await govToken.approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    await govToken.connect(wallet_1).approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.connect(wallet_1).delegateVotes(wallet_1.address, ethers.BigNumber.from('500000000000000000'))
    const weight = await linearVoting.calculateWeight(wallet_1.address)
  })


  it('can vote past the threshold with independent delegatation', async () => {
    const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    await govToken.approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    await govToken.connect(wallet_1).approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.connect(wallet_1).delegateVotes(wallet_1.address, ethers.BigNumber.from('500000000000000000'))
    await network.provider.send("evm_mine")
    const weight = await linearVoting.calculateWeight(wallet_1.address)
    expect(weight).to.equal(ethers.BigNumber.from('500000000000000000'))
    let addCall = buildContractCall(safe, "addOwnerWithThreshold", [wallet_2.address, 1], await safe.nonce())
    await proposalModule.submitModularProposal(safe.address, 0, addCall.data)
    let proposal = await proposalModule.proposals(0)
    expect(proposal.value).to.equal(0)
    expect(proposal.yesVotes).to.equal(ethers.BigNumber.from('500000000000000000'))
    expect(proposal.noVotes).to.equal(0)
    expect(proposal.proposer).to.equal(wallet_0.address)
    expect(proposal.canceled).to.equal(false)
    expect(proposal.targetAddress).to.equal(safe.address)
    expect(proposal.data).to.equal(addCall.data)
    await proposalModule.connect(wallet_1).vote(0, true)
    proposal = await proposalModule.proposals(0)
    expect(proposal.yesVotes).to.equal(ethers.BigNumber.from('1000000000000000000'))
    await network.provider.send("evm_increaseTime", [60])
    await proposalModule.startModularQueue(0)
    proposal = await proposalModule.proposals(0)
    expect(proposal.queued).to.equal(true)
    await network.provider.send("evm_increaseTime", [60])
    await proposalModule.executeModularProposal(0)
    proposal = await proposalModule.proposals(0)
    expect(proposal.executed).to.equal(true)
    const owners = await safe.getOwners()
    expect(owners[0]).to.equal(wallet_2.address)
    expect(owners[1]).to.equal(wallet_0.address)
  })

  it.skip('can only vote once per proposal', async () => {
    const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    await govToken.approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    await govToken.connect(wallet_1).approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.connect(wallet_1).delegateVotes(wallet_1.address, ethers.BigNumber.from('500000000000000000'))
    let addCall = buildContractCall(safe, "addOwnerWithThreshold", [wallet_2.address, 1], await safe.nonce())
    await proposalModule.submitModularProposal(safe.address, 0, addCall.data)
    await proposalModule.connect(wallet_1).vote(0, true)
    await proposalModule.connect(wallet_1).vote(0, true)
  })

  it.skip('cannot enter queue if not past threshold', async () => {
    const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    await govToken.approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    let addCall = buildContractCall(safe, "addOwnerWithThreshold", [wallet_2.address, 1], await safe.nonce())
    await proposalModule.submitModularProposal(safe.address, 0, addCall.data)
    let proposal = await proposalModule.proposals(0)
    expect(proposal.yesVotes).to.equal(ethers.BigNumber.from('500000000000000000'))
    await network.provider.send("evm_increaseTime", [60])
    await proposalModule.startModularQueue(0)
  })

  it.skip('cannot enter queue if not past deadline', async () => {
    const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    await govToken.approve(linearVoting.address, ethers.BigNumber.from('1000000000000000000'))
    await linearVoting.delegateVotes(wallet_0.address, ethers.BigNumber.from('1000000000000000000'))
    let addCall = buildContractCall(safe, "addOwnerWithThreshold", [wallet_2.address, 1], await safe.nonce())
    await proposalModule.submitModularProposal(safe.address, 0, addCall.data)
    let proposal = await proposalModule.proposals(0)
    await proposalModule.startModularQueue(0)
  })

  it.skip('can have only one DAO proposal at a time', async () => {
    const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    await govToken.approve(linearVoting.address, ethers.BigNumber.from('1000000000000000000'))
    await linearVoting.delegateVotes(wallet_0.address, ethers.BigNumber.from('1000000000000000000'))
    let addCall = buildContractCall(safe, "addOwnerWithThreshold", [wallet_2.address, 1], await safe.nonce())
    await proposalModule.submitModularProposal(safe.address, 0, addCall.data)
    await proposalModule.submitModularProposal(safe.address, 0, addCall.data)
  })

  it('can complete a funding proposals', async () => {
    const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    await govToken.approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    await govToken.connect(wallet_1).approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.connect(wallet_1).delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    let transferCall = buildContractCall(govToken, "transfer", [wallet_2.address, 1000], await safe.nonce())
    await proposalModule.submitModularProposal(govToken.address, 0, transferCall.data)
    let proposal = await proposalModule.proposals(0)
    expect(proposal.value).to.equal(0)
    expect(proposal.yesVotes).to.equal(ethers.BigNumber.from('1000000000000000000'))
    expect(proposal.noVotes).to.equal(0)
    expect(proposal.proposer).to.equal(wallet_0.address)
    expect(proposal.canceled).to.equal(false)
    expect(proposal.targetAddress).to.equal(govToken.address)
    expect(proposal.data).to.equal(transferCall.data)
    await network.provider.send("evm_increaseTime", [60])
    await proposalModule.startModularQueue(0)
    proposal = await proposalModule.proposals(0)
    expect(proposal.queued).to.equal(true)
    await network.provider.send("evm_increaseTime", [60])
    await proposalModule.executeModularProposal(0)
    proposal = await proposalModule.proposals(0)
    expect(proposal.executed).to.equal(true)
    expect(await govToken.balanceOf(wallet_2.address)).to.equal(ethers.BigNumber.from('1000000000000001000'))
  })

  it.skip('can failsafe remove module before funding proposals', async () => {
    const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    await govToken.approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    await govToken.connect(wallet_1).approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.connect(wallet_1).delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    let transferCall = buildContractCall(govToken, "transfer", [wallet_2.address, 1000], await safe.nonce())
    await proposalModule.submitModularProposal(govToken.address, 0, transferCall.data)
    let proposal = await proposalModule.proposals(0)
    expect(proposal.value).to.equal(0)
    expect(proposal.yesVotes).to.equal(ethers.BigNumber.from('1000000000000000000'))
    expect(proposal.noVotes).to.equal(0)
    expect(proposal.proposer).to.equal(wallet_0.address)
    expect(proposal.canceled).to.equal(false)
    expect(proposal.targetAddress).to.equal(govToken.address)
    expect(proposal.data).to.equal(transferCall.data)
    await network.provider.send("evm_increaseTime", [60])
    await proposalModule.startModularQueue(0)
    proposal = await proposalModule.proposals(0)
    expect(proposal.queued).to.equal(true)
    await executeContractCallWithSigners(safe, safe, "disableModule", ['0x0000000000000000000000000000000000000001', proposalModule.address], [wallet_0])
    expect(await safe.isModuleEnabled(proposalModule.address)).to.equal(false)
    let modules = await safe.getModulesPaginated('0x0000000000000000000000000000000000000001',1)
    await network.provider.send("evm_increaseTime", [60])
    await proposalModule.executeModularProposal(0)
  })

  it('can cancel a proposal by creator', async () => {
    const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    await govToken.approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    await govToken.connect(wallet_1).approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.connect(wallet_1).delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    let transferCall = buildContractCall(govToken, "transfer", [wallet_2.address, 1000], await safe.nonce())
    await proposalModule.submitModularProposal(govToken.address, 0, transferCall.data)
    await proposalModule.cancelProposal(0)
    let proposal = await proposalModule.proposals(0)
    expect(proposal.canceled).to.equal(true)
  })

  it('can cancel a proposal by Safe admin', async () => {
    const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    await govToken.approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    await govToken.connect(wallet_1).approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.connect(wallet_1).delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    let transferCall = buildContractCall(govToken, "transfer", [wallet_2.address, 1000], await safe.nonce())
    await proposalModule.submitModularProposal(govToken.address, 0, transferCall.data)
    await executeContractCallWithSigners(safe, proposalModule, "cancelProposal", [0], [wallet_0])
    let proposal = await proposalModule.proposals(0)
    expect(proposal.canceled).to.equal(true)
  })

  it.skip('cannot queue dao after cancel a proposal', async () => {
    const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    await govToken.approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    await govToken.connect(wallet_1).approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.connect(wallet_1).delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    let transferCall = buildContractCall(govToken, "transfer", [wallet_2.address, 1000], await safe.nonce())
    await proposalModule.submitModularProposal(govToken.address, 0, transferCall.data)
    await executeContractCallWithSigners(safe, proposalModule, "cancelProposal", [0], [wallet_0])
    let proposal = await proposalModule.proposals(0)
    await network.provider.send("evm_increaseTime", [60])
    await proposalModule.startModularQueue(0)
  })

  it.skip('cannot cancel a proposal after it passes', async () => {
    const { weth, proposalModule, linearVoting, safe, govToken } = daoFixture
    await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [wallet_0])
    await executeContractCallWithSigners(safe, proposalModule, "registerVoteModule", [linearVoting.address], [wallet_0])
    await govToken.approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    await govToken.connect(wallet_1).approve(linearVoting.address, ethers.BigNumber.from('500000000000000000'))
    await linearVoting.connect(wallet_1).delegateVotes(wallet_0.address, ethers.BigNumber.from('500000000000000000'))
    let transferCall = buildContractCall(govToken, "transfer", [wallet_2.address, 1000], await safe.nonce())
    await proposalModule.submitModularProposal(govToken.address, 0, transferCall.data)
    await network.provider.send("evm_increaseTime", [60])
    await proposalModule.startModularQueue(0)
    await executeContractCallWithSigners(safe, proposalModule, "cancelProposal", [0], [wallet_0])
    await network.provider.send("evm_increaseTime", [60])
    await proposalModule.executeModularProposal(0)
  })
})
