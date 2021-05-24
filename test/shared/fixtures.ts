import WETH from '../../artifacts/contracts/test/WETH9.sol/WETH9.json'
import HouseDAOGov from '../../artifacts/contracts/HouseDAOGovernance.sol/HouseDAOGovernance.json'
import HouseDAONFT from '../../artifacts/contracts/HouseDAONFT.sol/HouseDAONFT.json'
import MultiNFT from '../../artifacts/contracts/test/NFT.sol/MultiWalkToken.json'

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat'
import { deployContract } from 'ethereum-waffle'
import { Contract } from 'ethers'

export interface DAOFixture {
  weth: Contract,
  houseDAOGov: Contract,
  houseDAONFT: Contract,
  multiNFT: Contract
}

export async function getFixtureWithParams(
  wallet: SignerWithAddress,
  fromWallet: boolean = true
): Promise<any> {

  const wethContract = await ethers.getContractFactory("WETH9")
  // deploy tokens
  const weth = await wethContract.deploy() 
  console.log('deployed weth: ', weth.address)

  const multiWalkToken = await ethers.getContractFactory("MultiWalkToken")
  const multiNFT = await multiWalkToken.deploy("Walk", "TWT") 
  console.log('deployed TokenWalk Domain: ', multiNFT.address)

  return {
    weth,
    multiNFT
  }
}
