import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { ethers, network, waffle } from 'hardhat'
import { DAOFixture, getFixtureWithParams } from './shared/fixtures'
import { executeContractCallWithSigners } from './shared/utils'
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
  const [user1, user2, user3] = waffle.provider.getWallets();

  beforeEach(async function () {
    wallet = (await ethers.getSigners())[0]
    daoFixture = await getFixtureWithParams(wallet, true)
  })

  it('gnosis safe is initialized', async () => {
  	let wallet_1 = (await ethers.getSigners())[0]
    const { safe } = daoFixture

    const owners = await safe.getOwners()
    const version = await safe.VERSION()
    console.log(version)
    console.log(wallet.address)
    console.log(owners)
    console.log(safe.address)
  })

  it('gnosis safe add owner', async () => {
    let wallet_1 = (await ethers.getSigners())[0]
    let wallet_2 = (await ethers.getSigners())[1]
    const { safe } = daoFixture

    let owners = await safe.getOwners()
    console.log(owners)
    //await safe.addOwnerWithThreshold(wallet_2.address, 1)
    await executeContractCallWithSigners(safe, safe, "addOwnerWithThreshold", [user2.address, 1], [user1])
    owners = await safe.getOwners()
    console.log(owners)
  })

  it.only('gnosis safe enable gov module', async () => {
    let wallet_1 = (await ethers.getSigners())[0]
    let wallet_2 = (await ethers.getSigners())[1]
    const { safe, DAOGov } = daoFixture

    let owners = await safe.getOwners()
    console.log(owners)
    //await safe.addOwnerWithThreshold(wallet_2.address, 1)
    await executeContractCallWithSigners(safe, safe, "enableModule", [DAOGov.address], [user1])
  })
})
