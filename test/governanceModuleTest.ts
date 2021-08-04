import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { ethers, network, waffle } from 'hardhat'
import { DAOFixture, getFixtureWithParams } from './shared/fixtures'
import { executeContractCallWithSigners, buildContractCall, safeSignMessage, executeTx } from './shared/utils'
import { keccak256 } from 'ethereumjs-util'
import { defaultSender, provider, web3, contract } from '@openzeppelin/test-environment';

const zero = ethers.BigNumber.from(0)
const MaxUint256 = ethers.constants.MaxUint256

let daoFixture: DAOFixture
let wallet: SignerWithAddress

// TODOs:
// - figure out how to inspect nested mappings
// - figure out how to get expect reverts working

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


  it.only('can vote past the threshold with independent delegatation', async () => {
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

  it('can only vote once per proposal', async () => {
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

  it('cannot enter queue if not past deadline', async () => {

  })

  it('can have only one DAO proposal at a time', async () => {

  })


  it('multiple join DAO proposals', async () => {
    const { weth, proposalModule, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    let wallet_4 = (await ethers.getSigners())[3]
    await govToken.transfer(wallet_2.address, '1000000000000000000')
    await govToken.transfer(wallet_3.address, 10000)
    await govToken.transfer(wallet_4.address, 10000)
    await proposalModule.headOfHouseEnterMember(wallet_2.address)

    let role = {
      headOfHouse: false,
      member: true
    }

    await proposalModule.connect(wallet_3).joinDAOProposal(role)

    await proposalModule.connect(wallet_2).vote(0, true)
    let proposal = await proposalModule.proposals(0)
    expect(proposal.yesVotes).to.equal('1000000000000010000') // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0)
    expect(await govToken.balanceOf(wallet_3.address)).to.equal(10000)
    expect(await govToken.balanceOf(proposalModule.address)).to.equal('50000000000000000000000')
    await network.provider.send("evm_increaseTime", [259200])
    await proposalModule.connect(wallet_3).executeEnterDAOProposal(0)
    expect(await govToken.balanceOf(wallet_3.address)).to.equal(10000)
    proposal = await proposalModule.proposals(0)
    expect(proposal.executed).to.equal(true)
    expect(proposal.canceled).to.equal(false)
    let member = await proposalModule.members(wallet_3.address)
    expect(member.shares).to.equal(0)
    expect(member.roles.member).to.equal(true)

    await proposalModule.connect(wallet_4).joinDAOProposal(role)
    await proposalModule.connect(wallet_2).vote(1, true)
    proposal = await proposalModule.proposals(1)
    expect(proposal.yesVotes).to.equal('1000000000000010000') // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0)
    expect(await govToken.balanceOf(wallet_4.address)).to.equal(10000)
    expect(await govToken.balanceOf(proposalModule.address)).to.equal('50000000000000000000000')
    await network.provider.send("evm_increaseTime", [259200])
    await proposalModule.connect(wallet_4).executeEnterDAOProposal(1)
    expect(await govToken.balanceOf(wallet_4.address)).to.equal(10000)
    proposal = await proposalModule.proposals(1)
    expect(proposal.executed).to.equal(true)
    expect(proposal.canceled).to.equal(false)
    member = await proposalModule.members(wallet_4.address)
    expect(member.shares).to.equal(0)
    expect(member.roles.member).to.equal(true)
  })

  it('can complete a funding proposals', async () => {
    const { weth, proposalModule, govToken } = daoFixture
    let wallet_1 = (await ethers.getSigners())[0]
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    let wallet_4 = (await ethers.getSigners())[3]

    await govToken.transfer(wallet_2.address, '1000000000000000000')
    await govToken.transfer(wallet_3.address, 10000)
    await govToken.transfer(wallet_4.address, 10000)

    await weth.deposit({ value: '1000000000000000000' })
    await weth.approve(proposalModule.address, '1000000000000000000')
    await proposalModule.contribute(1000000)
    let member = await proposalModule.members(wallet_3.address)
    expect(member.shares).to.equal(0)
    expect(member.roles.member).to.equal(false)
    member = await proposalModule.members(wallet_1.address)
    expect(member.shares).to.equal(1000000)
    expect(member.roles.member).to.equal(true)

    await proposalModule.headOfHouseEnterMember(wallet_3.address)
    await proposalModule.headOfHouseEnterMember(wallet_2.address)

    await proposalModule.connect(wallet_3).submitProposal('0x0', wallet_3.address, 1000000, 0)
    let proposal = await proposalModule.proposals(0)
    expect(proposal.yesVotes).to.equal(10000) // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0)
    expect(proposal.targetAddress).to.equal(wallet_3.address)
    expect(proposal.fundsRequested).to.equal(1000000)
    expect(proposal.proposalType).to.equal(0)
    await proposalModule.connect(wallet_2).vote(0, true)
    await network.provider.send("evm_increaseTime", [259200])

    await proposalModule.connect(wallet_3).startFundingProposalGracePeriod(0)
    proposal = await proposalModule.proposals(0)
    //expect(proposal.gracePeriod).to.equal(0)
    await network.provider.send("evm_increaseTime", [259200])
    await proposalModule.connect(wallet_3).executeFundingProposal(0)
    //await proposalModule.connect(wallet_3).executeFundingProposal(0)
    proposal = await proposalModule.proposals(0)
    expect(proposal.executed).to.equal(true)
    expect(await weth.balanceOf(proposalModule.address)).to.equal(0)
    expect(await weth.balanceOf(wallet_3.address)).to.equal(1000000)
    expect(await proposalModule.balance()).to.equal(0)
    expect(await proposalModule.totalContribution()).to.equal(1000000)
  })

  it('can withdraw proper amount before funding proposals', async () => {
    const { weth, proposalModule, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    let wallet_4 = (await ethers.getSigners())[3]
    await govToken.transfer(wallet_2.address, '1000000000000000000')
    await govToken.transfer(wallet_3.address, 10000)
    await govToken.transfer(wallet_4.address, 10000)

    await weth.deposit({ value: '1000000000000000000' })
    await weth.approve(proposalModule.address, '1000000000000000000')
    await proposalModule.contribute(1000000)
    await proposalModule.headOfHouseEnterMember(wallet_3.address)
    expect(await proposalModule.balance()).to.equal(1000000)
    expect(await proposalModule.totalContribution()).to.equal(1000000)
    // add more and withdraw again
    await weth.connect(wallet_3).deposit({ value: '1000000000000000000' })
    await weth.connect(wallet_3).approve(proposalModule.address, '1000000000000000000')
    await proposalModule.connect(wallet_3).contribute('1000000000000000000')
    await weth.connect(wallet_4).deposit({ value: '1000000000000000000' })
    await weth.connect(wallet_4).approve(proposalModule.address, '1000000000000000000')
    await proposalModule.headOfHouseEnterMember(wallet_4.address)
    await proposalModule.connect(wallet_4).contribute('1000000000000000000')

    expect(await proposalModule.balance()).to.equal('2000000000001000000')
    expect(await proposalModule.totalContribution()).to.equal('2000000000001000000')
    expect(await weth.balanceOf(proposalModule.address)).to.equal('2000000000001000000')
    let member = await proposalModule.members(wallet_3.address)
    expect(member.shares).to.equal('1000000000000000000')
    expect(member.roles.member).to.equal(true)
    await proposalModule.connect(wallet_3).withdraw()
    member = await proposalModule.members(wallet_3.address)
    expect(member.shares).to.equal(0)
    expect(member.roles.member).to.equal(false)
    expect(await weth.balanceOf(proposalModule.address)).to.equal('1000000000001000000')
    expect(await proposalModule.balance()).to.equal('1000000000001000000')
    expect(await proposalModule.totalContribution()).to.equal('1000000000001000000')
  })

  it('can withdraw proper amount after funding proposals', async () => {
    const { weth, proposalModule, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    let wallet_4 = (await ethers.getSigners())[3]
    await govToken.transfer(wallet_2.address, '1000000000000000000')
    await govToken.transfer(wallet_3.address, '1000000000000000000')
    await govToken.transfer(wallet_4.address, 10000)

    await proposalModule.headOfHouseEnterMember(wallet_3.address)
    await proposalModule.headOfHouseEnterMember(wallet_4.address)
    expect(await proposalModule.balance()).to.equal(0)
    expect(await proposalModule.totalContribution()).to.equal(0)
    expect(await weth.balanceOf(proposalModule.address)).to.equal(0)
    await weth.connect(wallet_3).deposit({ value: '1000000000000000000' })
    await weth.connect(wallet_3).approve(proposalModule.address, '1000000000000000000')
    await proposalModule.connect(wallet_3).contribute('1000000000000000000')
    await weth.connect(wallet_4).deposit({ value: '1000000000000000000' })
    await weth.connect(wallet_4).approve(proposalModule.address, '1000000000000000000')
    await proposalModule.connect(wallet_4).contribute('1000000000000000000')

    await proposalModule.connect(wallet_3).submitProposal('0x0', wallet_3.address, '1000000000000000000', 0)
    await network.provider.send("evm_increaseTime", [259200])
    await proposalModule.connect(wallet_3).startFundingProposalGracePeriod(0)
    let proposal = await proposalModule.proposals(0)
    //expect(proposal.gracePeriod).to.equal(0)
    await network.provider.send("evm_increaseTime", [259200])
    await proposalModule.connect(wallet_3).executeFundingProposal(0)
    expect(await weth.balanceOf(proposalModule.address)).to.equal('1000000000000000000')
    expect(await weth.balanceOf(wallet_3.address)).to.equal('1000000000000000000')
    expect(await proposalModule.balance()).to.equal('1000000000000000000')
    expect(await proposalModule.totalContribution()).to.equal('2000000000000000000')

    await proposalModule.connect(wallet_3).withdraw()
    expect(await weth.balanceOf(wallet_3.address)).to.equal('1500000000000000000')
    let member = await proposalModule.members(wallet_3.address)
    expect(member.shares).to.equal(0)
    expect(member.roles.member).to.equal(false)
    expect(await weth.balanceOf(proposalModule.address)).to.equal('500000000000000000')
    expect(await proposalModule.balance()).to.equal('500000000000000000')
    expect(await proposalModule.totalContribution()).to.equal('1000000000000000000')
  })

  it('can only vote once', async () => {
    const { weth, proposalModule, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    let wallet_4 = (await ethers.getSigners())[3]
    await govToken.transfer(wallet_2.address, '1000000000000000000')
    await govToken.transfer(wallet_3.address, '1000000000000000000')
    await govToken.transfer(wallet_4.address, 10000)

    await proposalModule.headOfHouseEnterMember(wallet_2.address)
    await weth.connect(wallet_2).deposit({ value: '1000000000000000000' })
    await weth.connect(wallet_2).approve(proposalModule.address, '1000000000000000000')
    await proposalModule.connect(wallet_2).contribute('1000000000000000000')
    let role = {
      headOfHouse: false,
      member: true
    }
    await proposalModule.connect(wallet_3).joinDAOProposal(role)
    await proposalModule.connect(wallet_4).joinDAOProposal(role)

    await proposalModule.connect(wallet_2).vote(0, true)
    //expect(await proposalModule.connect(wallet_2).vote(0, true)).to.be.revertedWith("already voted");
  })

  it('can change membership', async () => {
    const { weth, proposalModule, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    let wallet_4 = (await ethers.getSigners())[3]
    await govToken.transfer(wallet_2.address, '1000000000000000000')
    await govToken.transfer(wallet_3.address, '1000000000000000000')
    await govToken.transfer(wallet_4.address, 10000)

    await proposalModule.headOfHouseEnterMember(wallet_3.address)
    await proposalModule.headOfHouseEnterMember(wallet_4.address)
    expect(await proposalModule.balance()).to.equal(0)
    expect(await proposalModule.totalContribution()).to.equal(0)
    expect(await weth.balanceOf(proposalModule.address)).to.equal(0)
    let role = {
      headOfHouse: true,
      member: true
    }
    await proposalModule.connect(wallet_3).submitProposal(role, wallet_3.address, 0, 1)
    let proposal = await proposalModule.proposals(0)
    expect(proposal.yesVotes).to.equal('1000000000000000000') // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0)
    expect(proposal.targetAddress).to.equal(wallet_3.address)
    expect(proposal.fundsRequested).to.equal(0)
    expect(proposal.proposalType).to.equal(1)

    await network.provider.send("evm_increaseTime", [259200])
    await proposalModule.executeChangeRoleProposal(0)
    let member = await proposalModule.members(wallet_3.address)
    expect(member.shares).to.equal(0)
    expect(member.roles.member).to.equal(true)
    expect(member.roles.headOfHouse).to.equal(true)
    proposal = await proposalModule.proposals(0)
    expect(proposal.executed).to.equal(true)
    expect(proposal.canceled).to.equal(false)
  })

  it('can only execute one proposal at a time', async () => {

  })

  it('can only execute correct proposal types', async () => {

  })

  it('can cancel a proposal', async () => {

  })

  it('cannot enter dao after cancel a proposal', async () => {

  })

  it('cannot withdraw more than your contribution', async () => {

  })
})
