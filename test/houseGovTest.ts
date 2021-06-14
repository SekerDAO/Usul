import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { ethers, network } from 'hardhat'
import { DAOFixture, getFixtureWithParams } from './shared/fixtures'
import { keccak256 } from 'ethereumjs-util'
import { defaultSender, provider, web3, contract } from '@openzeppelin/test-environment';

const zero = ethers.BigNumber.from(0)
const MaxUint256 = ethers.constants.MaxUint256

let daoFixture: DAOFixture
let wallet: SignerWithAddress

// TODOs:
// - figure out how to inspect nested mappings
// - figure out how to get expect reverts working

describe('houseDAOgov:', () => {
  // async function createToken(totalSupply: BigNumber) {
  //   const { artToken } = tokenFixture
  // }

  beforeEach(async function () {
    wallet = (await ethers.getSigners())[0]
    daoFixture = await getFixtureWithParams(wallet, true)
  })

  it('house dao is initialized', async () => {
    const { houseDAOGov, govToken, weth } = daoFixture
    expect(await houseDAOGov.initialized()).to.equal(true)
    expect(await govToken.balanceOf(houseDAOGov.address)).to.equal('50000000000000000000000')
    expect(await houseDAOGov.totalProposalCount()).to.equal(0)
    expect(await houseDAOGov.proposalTime()).to.equal(86400)
    expect(await houseDAOGov.gracePeriod()).to.equal(259200)
    expect(await houseDAOGov.totalContribution()).to.equal(0)
    expect(await houseDAOGov.balance()).to.equal(0)
    expect(await houseDAOGov.threshold()).to.equal('1000000000000000000')
    //expect(await houseDAOGov.entryAmount()).to.equal(1000000)
    expect(await houseDAOGov.daoGovernanceSupply()).to.equal('50000000000000000000000')
    //expect(await houseDAOGov.remainingSupply()).to.equal('50000000000000000000000')
    expect(await houseDAOGov.governanceToken()).to.equal(govToken.address)
    expect(await houseDAOGov.WETH()).to.equal(weth.address)
  })

  it('head of house can enter a member', async () => {
    const { weth, houseDAOGov, govToken } = daoFixture
    let wallet_1 = (await ethers.getSigners())[0]
    let wallet_2 = (await ethers.getSigners())[1]
    let options = { value: 2000000 }
    await weth.deposit(options)
    expect(await weth.balanceOf(wallet_1.address)).to.equal(2000000)
    await weth.approve(houseDAOGov.address, 1000000)
    await govToken.transfer(wallet_2.address, 10000)
    await houseDAOGov.headOfHouseEnterMember(wallet_2.address)
    await houseDAOGov.contribute(1000000)

    expect(await govToken.balanceOf(wallet_2.address)).to.equal(10000)
    let member = await houseDAOGov.members(wallet_2.address)
    expect(member.roles.member).to.equal(true)
    expect(member.shares).to.equal(0)
    member = await houseDAOGov.members(wallet_1.address)
    expect(member.roles.member).to.equal(true)
    expect(member.shares).to.equal(1000000)
    expect(await houseDAOGov.balance()).to.equal(1000000)
    expect(await houseDAOGov.totalContribution()).to.equal(1000000)
    expect(await houseDAOGov.daoGovernanceSupply()).to.equal('50000000000000000000000')
    expect(await houseDAOGov.memberCount()).to.equal(2)
  })

  it('members can contribute more', async () => {
    const { weth, houseDAOGov, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let options = { value: 2000000 }
    await weth.deposit(options)
    await weth.approve(houseDAOGov.address, 1000000)
    await govToken.transfer(wallet_2.address, 10000)
    await houseDAOGov.headOfHouseEnterMember(wallet_2.address)

    await weth.connect(wallet_2).deposit(options)
    await weth.connect(wallet_2).approve(houseDAOGov.address, 1000000)
    await houseDAOGov.connect(wallet_2).contribute(1000000)
    await houseDAOGov.connect(wallet_2).contribute(1000000)

    expect(await govToken.balanceOf(wallet_2.address)).to.equal(10000)
    let member = await houseDAOGov.members(wallet_2.address)
    expect(member.shares).to.equal(2000000)
    expect(await houseDAOGov.balance()).to.equal(2000000)
    expect(await houseDAOGov.totalContribution()).to.equal(2000000)
    expect(await houseDAOGov.daoGovernanceSupply()).to.equal('50000000000000000000000')
  })

  it.only('enter a join member proposal', async () => {
    const { weth, houseDAOGov, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]

    let options = { value: 1000000 }
    let role = {
      headOfHouse: false,
      member: true
    }
    await weth.connect(wallet_2).deposit(options)
    await weth.connect(wallet_2).approve(houseDAOGov.address, 1000000)
    await houseDAOGov.connect(wallet_2).joinDAOProposal(1000000, role)

    let proposal = await houseDAOGov.proposals(0)
    expect(await govToken.balanceOf(wallet_2.address)).to.equal(0)

    expect(proposal.fundsRequested).to.equal(1000000)
    expect(proposal.role.member).to.equal(true)
    expect(proposal.role.headOfHouse).to.equal(false)
    expect(proposal.proposalType).to.equal(2)
    expect(proposal.yesVotes).to.equal(0) // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0)
    expect(proposal.executed).to.equal(false)
    //expect(proposal.deadline).to.equal(1622006945)
    expect(proposal.proposer).to.equal(wallet_2.address)
    expect(proposal.canceled).to.equal(false)
    expect(proposal.gracePeriod).to.equal(0)
    //expect(proposal.hasVoted(wallet_2.address)).to.equal(true)
    //let voted = await houseDAOGov.proposals(0).hasVoted(wallet_2.address)
    //console.log(voted)
    expect(await houseDAOGov.memberCount()).to.equal(1)
  })

  it('vote on a member proposal', async () => {
    const { weth, houseDAOGov, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]

    await weth.deposit({ value: 2000000 })
    await weth.approve(houseDAOGov.address, 1000000)

    await houseDAOGov.headOfHouseEnterMember(wallet_3.address, 1000000)

    let options = { value: 1000000 }
    let role = {
      headOfHouse: false,
      member: true
    }
    await weth.connect(wallet_2).deposit(options)
    await weth.connect(wallet_2).approve(houseDAOGov.address, 1000000)
    await houseDAOGov.connect(wallet_2).joinDAOProposal(1000000, role)
    await houseDAOGov.connect(wallet_3).vote(0, true)

    let proposal = await houseDAOGov.proposals(0)
    expect(await govToken.balanceOf(wallet_3.address)).to.equal('1000000000000000000')

    expect(proposal.yesVotes).to.equal('1000000000000000000') // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0) 
  })

  it('can execute enter DAO proposal', async () => {
    const { weth, houseDAOGov, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    await weth.deposit({ value: '1000000000000000000' })
    await weth.approve(houseDAOGov.address, '1000000000000000000')
    await houseDAOGov.headOfHouseEnterMember(wallet_3.address, '1000000000000000000')
    expect(await houseDAOGov.memberCount()).to.equal(2)
    let role = {
      headOfHouse: false,
      member: true
    }
    await weth.connect(wallet_2).deposit({ value: 1000000 })
    await weth.connect(wallet_2).approve(houseDAOGov.address, 1000000)
    await houseDAOGov.connect(wallet_2).joinDAOProposal(1000000, role)
    await houseDAOGov.connect(wallet_3).vote(0, true)
    let proposal = await houseDAOGov.proposals(0)
    expect(proposal.yesVotes).to.equal('1000000000000000000') // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0)
    expect(await govToken.balanceOf(wallet_2.address)).to.equal(0)
    expect(await govToken.balanceOf(houseDAOGov.address)).to.equal('49999000000000000000000')
    await houseDAOGov.connect(wallet_2).executeEnterDAOProposal(0)
    expect(await govToken.balanceOf(wallet_2.address)).to.equal('1000000000000000000')
    proposal = await houseDAOGov.proposals(0)
    expect(proposal.executed).to.equal(true)
    expect(proposal.canceled).to.equal(false)
    let member = await houseDAOGov.members(wallet_2.address)
    expect(member.shares).to.equal(1000000)
    expect(member.roles.member).to.equal(true)
    expect(await houseDAOGov.balance()).to.equal('1000000000001000000')
    expect(await houseDAOGov.totalContribution()).to.equal('1000000000001000000')
    expect(await houseDAOGov.memberCount()).to.equal(3)
  })

  it('multiple join DAO proposals', async () => {
    const { weth, houseDAOGov, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    let wallet_4 = (await ethers.getSigners())[3]
    await weth.deposit({ value: '1000000000000000000' })
    await weth.approve(houseDAOGov.address, '1000000000000000000')
    await houseDAOGov.headOfHouseEnterMember(wallet_2.address, '1000000000000000000')

    let role = {
      headOfHouse: false,
      member: true
    }

    await weth.connect(wallet_3).deposit({ value: 1000000 })
    await weth.connect(wallet_3).approve(houseDAOGov.address, 1000000)
    await houseDAOGov.connect(wallet_3).joinDAOProposal(1000000, role)

    await weth.connect(wallet_4).deposit({ value: 1000000 })
    await weth.connect(wallet_4).approve(houseDAOGov.address, 1000000)
    await houseDAOGov.connect(wallet_4).joinDAOProposal(1000000, role)

    await houseDAOGov.connect(wallet_2).vote(0, true)
    let proposal = await houseDAOGov.proposals(0)
    expect(proposal.yesVotes).to.equal('1000000000000000000') // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0)
    expect(await govToken.balanceOf(wallet_3.address)).to.equal(0)
    expect(await govToken.balanceOf(houseDAOGov.address)).to.equal('49999000000000000000000')
    await houseDAOGov.connect(wallet_3).executeEnterDAOProposal(0)
    expect(await govToken.balanceOf(wallet_3.address)).to.equal('1000000000000000000')
    proposal = await houseDAOGov.proposals(0)
    expect(proposal.executed).to.equal(true)
    expect(proposal.canceled).to.equal(false)
    let member = await houseDAOGov.members(wallet_3.address)
    expect(member.shares).to.equal(1000000)
    expect(member.roles.member).to.equal(true)

    await houseDAOGov.connect(wallet_2).vote(1, true)
    proposal = await houseDAOGov.proposals(1)
    expect(proposal.yesVotes).to.equal('1000000000000000000') // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0)
    expect(await govToken.balanceOf(wallet_4.address)).to.equal(0)
    expect(await govToken.balanceOf(houseDAOGov.address)).to.equal('49998000000000000000000')
    await houseDAOGov.connect(wallet_4).executeEnterDAOProposal(1)
    expect(await govToken.balanceOf(wallet_4.address)).to.equal('1000000000000000000')
    proposal = await houseDAOGov.proposals(1)
    expect(proposal.executed).to.equal(true)
    expect(proposal.canceled).to.equal(false)
    member = await houseDAOGov.members(wallet_4.address)
    expect(member.shares).to.equal(1000000)
    expect(member.roles.member).to.equal(true)
  })

  it('can complete a funding proposals', async () => {
    const { weth, houseDAOGov, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    let wallet_4 = (await ethers.getSigners())[3]

    await weth.deposit({ value: '1000000000000000000' })
    await weth.approve(houseDAOGov.address, '1000000000000000000')
    await houseDAOGov.headOfHouseEnterMember(wallet_3.address, '1000000000000000000')

    await houseDAOGov.connect(wallet_3).submitProposal('0x0', wallet_3.address, 1000000, 0)
    let proposal = await houseDAOGov.proposals(0)
    expect(proposal.yesVotes).to.equal('1000000000000000000') // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0)
    expect(proposal.targetAddress).to.equal(wallet_3.address)
    expect(proposal.fundsRequested).to.equal(1000000)
    expect(proposal.proposalType).to.equal(0)

    await houseDAOGov.connect(wallet_3).startFundingProposalGracePeriod(0)
    proposal = await houseDAOGov.proposals(0)
    //expect(proposal.gracePeriod).to.equal(0)
    await network.provider.send("evm_increaseTime", [259200])
    await houseDAOGov.connect(wallet_3).executeFundingProposal(0)
    //await houseDAOGov.connect(wallet_3).executeFundingProposal(0)
    proposal = await houseDAOGov.proposals(0)
    expect(proposal.executed).to.equal(true)
    expect(await weth.balanceOf(houseDAOGov.address)).to.equal('999999999999000000')
    expect(await houseDAOGov.balance()).to.equal('999999999999000000')
    expect(await houseDAOGov.totalContribution()).to.equal('1000000000000000000')
  })

  it('can withdraw proper amount before funding proposals', async () => {
    const { weth, houseDAOGov, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    let wallet_4 = (await ethers.getSigners())[3]
    await weth.deposit({ value: '1000000000000000000' })
    await weth.approve(houseDAOGov.address, '1000000000000000000')
    await houseDAOGov.headOfHouseEnterMember(wallet_3.address, '1000000000000000000')
    expect(await houseDAOGov.balance()).to.equal('1000000000000000000')
    await houseDAOGov.connect(wallet_3).withdraw()
    expect(await houseDAOGov.balance()).to.equal(0)
    expect(await houseDAOGov.totalContribution()).to.equal(0)
    // add more and withdraw again
    await weth.connect(wallet_3).deposit({ value: '1000000000000000000' })
    await weth.connect(wallet_3).approve(houseDAOGov.address, '1000000000000000000')
    await houseDAOGov.connect(wallet_3).addMoreContribution('1000000000000000000')
    await weth.deposit({ value: '1000000000000000000' })
    await weth.approve(houseDAOGov.address, '1000000000000000000')
    await houseDAOGov.headOfHouseEnterMember(wallet_4.address, '1000000000000000000') 
    expect(await houseDAOGov.balance()).to.equal('2000000000000000000')
    expect(await houseDAOGov.totalContribution()).to.equal('2000000000000000000')
    expect(await weth.balanceOf(houseDAOGov.address)).to.equal('2000000000000000000')
    let member = await houseDAOGov.members(wallet_3.address)
    expect(member.shares).to.equal('1000000000000000000')
    expect(member.roles.member).to.equal(true)
    await houseDAOGov.connect(wallet_3).withdraw()
    member = await houseDAOGov.members(wallet_3.address)
    expect(member.shares).to.equal(0)
    expect(await weth.balanceOf(houseDAOGov.address)).to.equal('1000000000000000000')
    expect(await houseDAOGov.balance()).to.equal('1000000000000000000')
    expect(await houseDAOGov.totalContribution()).to.equal('1000000000000000000')
  })

  it('can withdraw proper amount after funding proposals', async () => {
    const { weth, houseDAOGov, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    let wallet_4 = (await ethers.getSigners())[3]

    await weth.deposit({ value: '1000000000000000000' })
    await weth.approve(houseDAOGov.address, '1000000000000000000')
    await houseDAOGov.headOfHouseEnterMember(wallet_3.address, '1000000000000000000')

    await weth.deposit({ value: '1000000000000000000' })
    await weth.approve(houseDAOGov.address, '1000000000000000000')
    await houseDAOGov.headOfHouseEnterMember(wallet_4.address, '1000000000000000000')
    expect(await houseDAOGov.balance()).to.equal('2000000000000000000')
    expect(await houseDAOGov.totalContribution()).to.equal('2000000000000000000')
    expect(await weth.balanceOf(houseDAOGov.address)).to.equal('2000000000000000000')

    await houseDAOGov.connect(wallet_3).submitProposal('0x0', wallet_3.address, '1000000000000000000', 0)
    await houseDAOGov.connect(wallet_3).startFundingProposalGracePeriod(0)
    let proposal = await houseDAOGov.proposals(0)
    //expect(proposal.gracePeriod).to.equal(0)
    await network.provider.send("evm_increaseTime", [259200])
    await houseDAOGov.connect(wallet_3).executeFundingProposal(0)
    expect(await weth.balanceOf(houseDAOGov.address)).to.equal('1000000000000000000')
    expect(await weth.balanceOf(wallet_3.address)).to.equal('1000000000000000000')
    expect(await houseDAOGov.balance()).to.equal('1000000000000000000')
    expect(await houseDAOGov.totalContribution()).to.equal('2000000000000000000')

    await houseDAOGov.connect(wallet_3).withdraw()
    let member = await houseDAOGov.members(wallet_3.address)
    expect(member.shares).to.equal(0)
    expect(await weth.balanceOf(houseDAOGov.address)).to.equal('500000000000000000')
    expect(await houseDAOGov.balance()).to.equal('500000000000000000')
    expect(await houseDAOGov.totalContribution()).to.equal('1000000000000000000')
  })

  it('can only vote once', async () => {
    const { weth, houseDAOGov, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    let wallet_4 = (await ethers.getSigners())[3]
    await weth.deposit({ value: '1000000000000000000' })
    await weth.approve(houseDAOGov.address, '1000000000000000000')
    await houseDAOGov.headOfHouseEnterMember(wallet_2.address, '1000000000000000000')
    let role = {
      headOfHouse: false,
      member: true
    }

    await weth.connect(wallet_3).deposit({ value: 1000000 })
    await weth.connect(wallet_3).approve(houseDAOGov.address, 1000000)
    await houseDAOGov.connect(wallet_3).joinDAOProposal(1000000, role)

    await weth.connect(wallet_4).deposit({ value: 1000000 })
    await weth.connect(wallet_4).approve(houseDAOGov.address, 1000000)
    await houseDAOGov.connect(wallet_4).joinDAOProposal(1000000, role)

    await houseDAOGov.connect(wallet_2).vote(0, true)
    //expect(await houseDAOGov.connect(wallet_2).vote(0, true)).to.be.revertedWith("already voted");
  })

  it('can change membership', async () => {
    const { weth, houseDAOGov, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    let wallet_4 = (await ethers.getSigners())[3]

    await weth.deposit({ value: '1000000000000000000' })
    await weth.approve(houseDAOGov.address, '1000000000000000000')
    await houseDAOGov.headOfHouseEnterMember(wallet_3.address, '1000000000000000000')

    await weth.deposit({ value: '1000000000000000000' })
    await weth.approve(houseDAOGov.address, '1000000000000000000')
    await houseDAOGov.headOfHouseEnterMember(wallet_4.address, '1000000000000000000')
    expect(await houseDAOGov.balance()).to.equal('2000000000000000000')
    expect(await houseDAOGov.totalContribution()).to.equal('2000000000000000000')
    expect(await weth.balanceOf(houseDAOGov.address)).to.equal('2000000000000000000')
    let role = {
      headOfHouse: true,
      member: true
    }
    await houseDAOGov.connect(wallet_3).submitProposal(role, wallet_3.address, 0, 1)
    let proposal = await houseDAOGov.proposals(0)
    expect(proposal.yesVotes).to.equal('1000000000000000000') // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0)
    expect(proposal.targetAddress).to.equal(wallet_3.address)
    expect(proposal.fundsRequested).to.equal(0)
    expect(proposal.proposalType).to.equal(1)

    await houseDAOGov.executeChangeRoleProposal(0)
    let member = await houseDAOGov.members(wallet_3.address)
    expect(member.shares).to.equal('1000000000000000000')
    expect(member.roles.member).to.equal(true)
    expect(member.roles.headOfHouse).to.equal(true)
    proposal = await houseDAOGov.proposals(0)
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
