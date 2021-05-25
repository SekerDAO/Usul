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

  it('enter as member', async () => {
    // const { weth, houseDAOGov, govToken } = daoFixture
    // let wallet_2 = (await ethers.getSigners())[1]

    // let options = { value: 1000000 }
    // await weth.connect(wallet_2).deposit(options)
    // await weth.connect(wallet_2).approve(houseDAOGov.address, 1000000)
    // joinDAOProposal(uint _contribution, Role memory _role)
    // await houseDAOGov.joinDAOProposal(wallet_2.address, 1000000)
  })

})
