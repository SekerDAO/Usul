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
    const { weth, houseDAOGov, multiNFT, govToken } = daoFixture

    //await expect(houseDAOGov.)
    // console.log(artToken.address)
    // let name = await artToken.name()
    // expect(await artToken.name.call()).to.equal(name)
    // console.log(name)
    //expect(await artToken.name().to.equal('Test ArtToken'))
    // await tokenBase.approve(router.address, baseSupply)
    // await tokenQuote.approve(router.address, zero)
    // await expect(router.addLiquidity({
    //   sender: wallet.address,
    //   to: wallet.address,
    //   tokenBase: tokenBase.address,
    //   tokenQuote: tokenQuote.address,
    //   amountBase: baseSupply,
    //   amountQuote: zero,
    //   slopeNumerator: 1e6,
    //   n: 1,
    //   fee: 0
    // }, MaxUint256))
    //   .to.emit(pair, 'Deposit')
    //   .withArgs(router.address, baseSupply, zero, zero, wallet.address)
  })


})
