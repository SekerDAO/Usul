import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { ethers } from 'hardhat'
import { DAOFixture, getFixtureWithParams } from './shared/fixtures'
import { keccak256 } from 'ethereumjs-util'
import { defaultSender, provider, web3, contract } from '@openzeppelin/test-environment';

const zero = ethers.BigNumber.from(0)
const MaxUint256 = ethers.constants.MaxUint256

let daoFixture: DAOFixture
let wallet: SignerWithAddress

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
    expect(await houseDAOGov.entryAmount()).to.equal(1000000)
    expect(await houseDAOGov.totalGovernanceSupply()).to.equal('50000000000000000000000')
    expect(await houseDAOGov.remainingSupply()).to.equal('50000000000000000000000')
    expect(await houseDAOGov.governanceToken()).to.equal(govToken.address)
    expect(await houseDAOGov.WETH()).to.equal(weth.address)
  })

  it('head of house can enter a member', async () => {
    const { weth, houseDAOGov, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]

    let options = { value: 2000000 }
    await weth.connect(wallet_2).deposit(options)
    expect(await weth.balanceOf(wallet_2.address)).to.equal(2000000)
    await weth.connect(wallet_2).approve(houseDAOGov.address, 1000000)

    await houseDAOGov.headOfHouseEnterMember(wallet_2.address, 1000000)

    expect(await govToken.balanceOf(wallet_2.address)).to.equal(1000000)
    let member = await houseDAOGov.members(wallet_2.address)
    expect(member.roles.member).to.equal(true)
    expect(member.shares).to.equal(1000000)
    expect(await houseDAOGov.balance()).to.equal(1000000)
    expect(await houseDAOGov.totalContribution()).to.equal(1000000)
    expect(await houseDAOGov.remainingSupply()).to.equal('49999999999999999000000')
  })

  it('members can contribute more', async () => {
    const { weth, houseDAOGov, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]

    let options = { value: 2000000 }
    await weth.connect(wallet_2).deposit(options)
    expect(await weth.balanceOf(wallet_2.address)).to.equal(2000000)
    await weth.connect(wallet_2).approve(houseDAOGov.address, 1000000)

    await houseDAOGov.headOfHouseEnterMember(wallet_2.address, 1000000)

    await weth.connect(wallet_2).approve(houseDAOGov.address, 1000000)
    await houseDAOGov.connect(wallet_2).addMoreContribution(1000000)

    expect(await govToken.balanceOf(wallet_2.address)).to.equal(2000000)
    let member = await houseDAOGov.members(wallet_2.address)
    expect(member.shares).to.equal(2000000)
    expect(await houseDAOGov.balance()).to.equal(2000000)
    expect(await houseDAOGov.totalContribution()).to.equal(2000000)
    expect(await houseDAOGov.remainingSupply()).to.equal('49999999999999998000000')
  })

  it('enter a join member proposal', async () => {
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
  })

  it('vote on a member proposal', async () => {
    const { weth, houseDAOGov, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]

    await weth.connect(wallet_3).deposit({ value: 2000000 })
    expect(await weth.balanceOf(wallet_3.address)).to.equal(2000000)
    await weth.connect(wallet_3).approve(houseDAOGov.address, 1000000)

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
    expect(await govToken.balanceOf(wallet_3.address)).to.equal(1000000)

    expect(proposal.yesVotes).to.equal(1000000) // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0) 
  })

  it('can execute enter DAO proposal', async () => {
    const { weth, houseDAOGov, govToken } = daoFixture
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    await weth.connect(wallet_3).deposit({ value: '1000000000000000000' })
    await weth.connect(wallet_3).approve(houseDAOGov.address, '1000000000000000000')
    await houseDAOGov.headOfHouseEnterMember(wallet_3.address, '1000000000000000000')
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
    expect(await govToken.balanceOf(wallet_2.address)).to.equal(1000000)
    proposal = await houseDAOGov.proposals(0)
    expect(proposal.executed).to.equal(true)
    expect(proposal.canceled).to.equal(false)
    let member = await houseDAOGov.members(wallet_2.address)
    expect(member.shares).to.equal(1000000)
    expect(member.roles.member).to.equal(true)
  })
})
