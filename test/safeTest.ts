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

  it.only('house dao is initialized', async () => {
  	let wallet_1 = (await ethers.getSigners())[0]
    const { safe } = daoFixture

    // expect(await houseDAONFT.totalProposalCount()).to.equal(0)
    // expect(await houseDAONFT.memberCount()).to.equal(1)
    // expect(await houseDAONFT.proposalTime()).to.equal(86400)
    // expect(await houseDAONFT.gracePeriod()).to.equal(259200)
    // expect(await houseDAONFT.balance()).to.equal(0)
    // expect(await houseDAONFT.threshold()).to.equal(5)
    // expect(await houseDAONFT.nftPrice()).to.equal(ethers.utils.parseEther('0.5'))
    // expect(await houseDAONFT.issuanceSupply()).to.equal(0)
    // expect(await houseDAONFT.minimumProposalAmount()).to.equal(1)
    // expect(await houseDAONFT.ERC721Address()).to.equal(multiNFT.address)
    // expect(await houseDAONFT.WETH()).to.equal(weth.address)
  })
})
