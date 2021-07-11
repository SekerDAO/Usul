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

describe('houseDAOnft:', () => {
  // async function createToken(totalSupply: BigNumber) {
  //   const { artToken } = tokenFixture
  // }

  beforeEach(async function () {
    wallet = (await ethers.getSigners())[0]
    daoFixture = await getFixtureWithParams(wallet, true)
  })

  it('house dao is initialized', async () => {
  	let wallet_1 = (await ethers.getSigners())[0]
    const { houseDAONFT, multiNFT, weth } = daoFixture

    expect(await houseDAONFT.totalProposalCount()).to.equal(0)
    expect(await houseDAONFT.memberCount()).to.equal(1)
    expect(await houseDAONFT.proposalTime()).to.equal(86400)
    expect(await houseDAONFT.gracePeriod()).to.equal(259200)
    expect(await houseDAONFT.balance()).to.equal(0)
    expect(await houseDAONFT.threshold()).to.equal(5)
    expect(await houseDAONFT.nftPrice()).to.equal(ethers.utils.parseEther('0.5'))
    expect(await houseDAONFT.issuanceSupply()).to.equal(0)
    expect(await houseDAONFT.minimumProposalAmount()).to.equal(1)
    expect(await houseDAONFT.ERC721Address()).to.equal(multiNFT.address)
    expect(await houseDAONFT.WETH()).to.equal(weth.address)
  })

  it('can enter as a member', async () => {
    const { weth, houseDAONFT, multiNFT } = daoFixture
    let wallet_1 = (await ethers.getSigners())[0]
    let wallet_2 = (await ethers.getSigners())[1]
    await multiNFT.transferFrom(wallet_1.address, wallet_2.address, 1)
    await houseDAONFT.connect(wallet_2).nftMembershipEntry()

    let member = await houseDAONFT.members(wallet_2.address)
    expect(member.roles.member).to.equal(true)
    expect(member.shares).to.equal(0)
    expect(await houseDAONFT.balance()).to.equal(0)
    expect(await houseDAONFT.issuanceSupply()).to.equal(0)
    expect(await houseDAONFT.memberCount()).to.equal(2)
  })

  it('can purchase entry nft', async () => {
    const { weth, houseDAONFT, multiNFT } = daoFixture
    let wallet_1 = (await ethers.getSigners())[0]
    let wallet_2 = (await ethers.getSigners())[1]
    let options = { value: ethers.utils.parseEther('0.5') }
    await weth.connect(wallet_2).deposit(options)
    await weth.connect(wallet_2).approve(houseDAONFT.address, ethers.utils.parseEther('0.5'))
    expect(await weth.balanceOf(wallet_2.address)).to.equal('500000000000000000')
    expect(await multiNFT.balanceOf(wallet_2.address)).to.equal(0)
    await houseDAONFT.connect(wallet_2).contribute(["https://ipfs.io/ipfs/"])
    expect(await weth.balanceOf(wallet_2.address)).to.equal(0)
    expect(await multiNFT.tokenURI(5)).to.equal("https://ipfs.io/ipfs/")
    expect(await multiNFT.ownerOf(5)).to.equal(wallet_2.address)
    expect(await multiNFT.ownerOf(4)).to.equal(wallet_1.address)
    expect(await multiNFT.balanceOf(wallet_2.address)).to.equal(1)
    let member = await houseDAONFT.members(wallet_2.address)
    expect(member.roles.member).to.equal(true)
    expect(member.shares).to.equal(0)
    expect(member.activeProposal).to.equal(false)
    expect(await houseDAONFT.balance()).to.equal(ethers.utils.parseEther('0.5'))
    expect(await houseDAONFT.issuanceSupply()).to.equal(1)
    expect(await houseDAONFT.memberCount()).to.equal(2)
  })

  it('non-members can contribute more', async () => {
    const { weth, houseDAONFT } = daoFixture
    let wallet_3 = (await ethers.getSigners())[3]
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_1 = (await ethers.getSigners())[0]
    let options = { value: ethers.utils.parseEther('0.5') }
    await weth.connect(wallet_2).deposit(options)
    await weth.connect(wallet_2).approve(houseDAONFT.address, ethers.utils.parseEther('0.5'))
    await houseDAONFT.connect(wallet_2).contribute(["https://ipfs.io/ipfs/"])

    let options2 = { value: 2000000 }
    await weth.connect(wallet_3).deposit(options2)
    expect(await weth.balanceOf(wallet_3.address)).to.equal(2000000)
    await weth.connect(wallet_3).approve(houseDAONFT.address, 1000000)
    await houseDAONFT.connect(wallet_3).fundDAO(1000000)

    expect(await houseDAONFT.balance()).to.equal('500000000001000000')

    await weth.connect(wallet_2).deposit(options)
    await weth.connect(wallet_2).approve(houseDAONFT.address, ethers.utils.parseEther('0.5'))
    await houseDAONFT.connect(wallet_2).fundDAO(ethers.utils.parseEther('0.5'))
    expect(await houseDAONFT.balance()).to.equal('1000000000001000000')
  })

  it('can enter multiple members', async () => {
    const { weth, houseDAONFT, multiNFT } = daoFixture
    let wallet_1 = (await ethers.getSigners())[0]
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    await multiNFT.transferFrom(wallet_1.address, wallet_2.address, 1)
    await multiNFT.transferFrom(wallet_1.address, wallet_3.address, 2)
    await houseDAONFT.connect(wallet_2).nftMembershipEntry()

    let member = await houseDAONFT.members(wallet_2.address)
    expect(member.roles.member).to.equal(true)
    expect(member.shares).to.equal(0)
    expect(await houseDAONFT.balance()).to.equal(0)
    expect(await houseDAONFT.issuanceSupply()).to.equal(0)
    expect(await houseDAONFT.memberCount()).to.equal(2)

    await houseDAONFT.connect(wallet_3).nftMembershipEntry()
    member = await houseDAONFT.members(wallet_3.address)
    expect(member.roles.member).to.equal(true)
    expect(member.shares).to.equal(0)
    expect(await houseDAONFT.balance()).to.equal(0)
    expect(await houseDAONFT.issuanceSupply()).to.equal(0)
    expect(await houseDAONFT.memberCount()).to.equal(3)
  })

  it('can complete a funding proposals', async () => {
    const { weth, houseDAONFT, multiNFT } = daoFixture
    let wallet_1 = (await ethers.getSigners())[0]
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    let options = { value: ethers.utils.parseEther('0.5') }
    await weth.connect(wallet_2).deposit(options)
    await weth.connect(wallet_2).approve(houseDAONFT.address, ethers.utils.parseEther('0.5'))
    await houseDAONFT.connect(wallet_2).contribute(["https://ipfs.io/ipfs/"])

    await weth.connect(wallet_3).deposit(options)
    await weth.connect(wallet_3).approve(houseDAONFT.address, ethers.utils.parseEther('0.5'))
    await houseDAONFT.connect(wallet_3).contribute(["https://ipfs.io/ipfs/"])

    await multiNFT.transferFrom(wallet_1.address, wallet_2.address, 1)
    await multiNFT.transferFrom(wallet_1.address, wallet_2.address, 2)
    await multiNFT.transferFrom(wallet_1.address, wallet_2.address, 3)
    await multiNFT.transferFrom(wallet_1.address, wallet_2.address, 4)

    expect(await weth.balanceOf(wallet_2.address)).to.equal(0)
    let role = { headOfHouse: false, member: true }
    await houseDAONFT.connect(wallet_3).submitProposal(role, wallet_3.address, ethers.utils.parseEther('0.2'), 0)
    let proposal = await houseDAONFT.proposals(0)
    expect(proposal.yesVotes).to.equal(1) // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0) 
    expect(proposal.proposalType).to.equal(0)

    await houseDAONFT.connect(wallet_2).vote(0, true)
    proposal = await houseDAONFT.proposals(0)
    expect(proposal.yesVotes).to.equal(6) // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0)
    expect(proposal.proposalType).to.equal(0)

    await houseDAONFT.startFundingProposalGracePeriod(0)
    await network.provider.send("evm_increaseTime", [259200])
    await houseDAONFT.executeFundingProposal(0)
    proposal = await houseDAONFT.proposals(0)
    expect(proposal.executed).to.equal(true)
    expect(await houseDAONFT.balance()).to.equal('800000000000000000')
    expect(await weth.balanceOf(wallet_3.address)).to.equal('200000000000000000')

    await houseDAONFT.connect(wallet_3).submitProposal(role, wallet_3.address, ethers.utils.parseEther('0.2'), 0)
    proposal = await houseDAONFT.proposals(1)
    expect(proposal.yesVotes).to.equal(1) // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0) 
    await houseDAONFT.connect(wallet_2).vote(1, true)
    proposal = await houseDAONFT.proposals(1)
    expect(proposal.yesVotes).to.equal(6) // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0)

    await houseDAONFT.startFundingProposalGracePeriod(1)
    await network.provider.send("evm_increaseTime", [259200])
    await houseDAONFT.executeFundingProposal(1)
    proposal = await houseDAONFT.proposals(1)
    expect(proposal.executed).to.equal(true)
    expect(await houseDAONFT.balance()).to.equal('600000000000000000')
    expect(await weth.balanceOf(wallet_3.address)).to.equal('400000000000000000')
  })

  it('can only vote once', async () => {
    const { weth, houseDAONFT, multiNFT } = daoFixture
    let wallet_1 = (await ethers.getSigners())[0]
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    let options = { value: ethers.utils.parseEther('0.5') }
    await weth.connect(wallet_2).deposit(options)
    await weth.connect(wallet_2).approve(houseDAONFT.address, ethers.utils.parseEther('0.5'))
    await houseDAONFT.connect(wallet_2).contribute(["https://ipfs.io/ipfs/"])

    await weth.connect(wallet_3).deposit(options)
    await weth.connect(wallet_3).approve(houseDAONFT.address, ethers.utils.parseEther('0.5'))
    await houseDAONFT.connect(wallet_3).contribute(["https://ipfs.io/ipfs/"])

    await multiNFT.transferFrom(wallet_1.address, wallet_2.address, 1)
    await multiNFT.transferFrom(wallet_1.address, wallet_2.address, 2)
    await multiNFT.transferFrom(wallet_1.address, wallet_2.address, 3)
    await multiNFT.transferFrom(wallet_1.address, wallet_2.address, 4)

    expect(await weth.balanceOf(wallet_2.address)).to.equal(0)
    let role = { headOfHouse: false, member: true }
    await houseDAONFT.connect(wallet_3).submitProposal(role, wallet_3.address, ethers.utils.parseEther('0.2'), 0)
    await houseDAONFT.connect(wallet_2).vote(0, true)
    //await houseDAONFT.connect(wallet_2).vote(0, false)
  })

  it('can change membership', async () => {
    const { weth, houseDAONFT, multiNFT } = daoFixture
    let wallet_1 = (await ethers.getSigners())[0]
    let wallet_2 = (await ethers.getSigners())[1]
    let wallet_3 = (await ethers.getSigners())[2]
    let options = { value: ethers.utils.parseEther('0.5') }
    await weth.connect(wallet_2).deposit(options)
    await weth.connect(wallet_2).approve(houseDAONFT.address, ethers.utils.parseEther('0.5'))
    await houseDAONFT.connect(wallet_2).contribute(["https://ipfs.io/ipfs/"])

    await weth.connect(wallet_3).deposit(options)
    await weth.connect(wallet_3).approve(houseDAONFT.address, ethers.utils.parseEther('0.5'))
    await houseDAONFT.connect(wallet_3).contribute(["https://ipfs.io/ipfs/"])

    await multiNFT.transferFrom(wallet_1.address, wallet_2.address, 1)
    await multiNFT.transferFrom(wallet_1.address, wallet_2.address, 2)
    await multiNFT.transferFrom(wallet_1.address, wallet_2.address, 3)
    await multiNFT.transferFrom(wallet_1.address, wallet_2.address, 4)

    expect(await weth.balanceOf(wallet_2.address)).to.equal(0)
    let role = { headOfHouse: true, member: true }
    await houseDAONFT.connect(wallet_3).submitProposal(role, wallet_3.address, 0, 1)
    let proposal = await houseDAONFT.proposals(0)
    expect(proposal.yesVotes).to.equal(1) // if they buy on the market this will be non-zero
    expect(proposal.noVotes).to.equal(0)
    expect(proposal.role.headOfHouse).to.equal(true)
    expect(proposal.proposalType).to.equal(1)

    await houseDAONFT.connect(wallet_2).vote(0, true)
    let member = await houseDAONFT.members(wallet_3.address)
    expect(member.roles.member).to.equal(true)
    expect(member.roles.headOfHouse).to.equal(false)
    await houseDAONFT.executeChangeRoleProposal(0)
    member = await houseDAONFT.members(wallet_3.address)
    expect(member.roles.member).to.equal(true)
    expect(member.shares).to.equal(0)
    expect(member.roles.headOfHouse).to.equal(true)
  })

  // it('can only execute correct proposal types', async () => {

  // })

  // it('can cancel a proposal', async () => {

  // })

  // it('cannot enter dao after cancel a proposal', async () => {

  // })

  // it('cannot withdraw more than your contribution', async () => {

  // })
})
