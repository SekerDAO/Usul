import WETH from '../../artifacts/contracts/test/WETH9.sol/WETH9.json'
import GovernanceToken from '../../artifacts/contracts/common/GovernanceToken.sol/GovernanceToken.json'
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
  multiNFT: Contract,
  govToken: Contract
}

export async function getFixtureWithParams(
  wallet: SignerWithAddress,
  fromWallet: boolean = true
): Promise<any> {

  const wethContract = await ethers.getContractFactory("WETH9")
  // deploy tokens
  const weth = await wethContract.deploy() 
  console.log('deployed weth: ', weth.address)

  const govTokenContract = await ethers.getContractFactory("GovernanceToken")
  const govToken = await govTokenContract.deploy("GovToken", "GT", ethers.BigNumber.from('100000000000000000000000'))
  console.log("deployed governance token: ", govToken.address)

  const multiWalkToken = await ethers.getContractFactory("MultiWalkToken")
  const multiNFT = await multiWalkToken.deploy("Walk", "TWT") 
  console.log('deployed TokenWalk Domain: ', multiNFT.address)
  await multiNFT.mintEdition('https://gateway.ipfs.io/ipfs/QmZuwWhEGkUKZgC2GzNrfCRKcrKbxYxskjSnTgpMQY9Dy2/metadata/', 75, {gasLimit:12450000})

  const houseGovContract = await ethers.getContractFactory("HouseDAOGovernance")
  const houseDAOGov = await houseGovContract.deploy(
   [wallet.address], // head of house
   govToken.address, // gov token addres
   ethers.BigNumber.from(1000000), // min entry fee in gov tokens
   ethers.BigNumber.from(1), // number of days proposals are active
   ethers.BigNumber.from('50000000000000000000000'), // total gov tokens supplied to contract
   ethers.BigNumber.from('1000000000000000000'), // number of votes wieghted to pass
   ethers.BigNumber.from(0), // min proposal gov token amt
   ethers.BigNumber.from('1000000000000000000'), // reward for entry in gov token
   weth.address
  )
  console.log('deployed House ERC20 DAO: ', houseDAOGov.address)
  await govToken.approve(houseDAOGov.address, ethers.BigNumber.from('50000000000000000000000'))
  await houseDAOGov.init()

  const houseNFTContract = await ethers.getContractFactory("HouseDAONFT")
  const houseDAONFT = await houseNFTContract.deploy(
   [wallet.address], // head of house
   multiNFT.address, // gov token addres
   wallet.address, // nft vault address
   ethers.BigNumber.from(1), // start index of gov tokens
   ethers.BigNumber.from(1), // number of days proposals are active
   ethers.BigNumber.from(5), // number of votes wieghted to pass
   ethers.BigNumber.from(1), // min proposal gov token amt
   ethers.BigNumber.from(75), // issuance supply
   weth.address,
   ethers.utils.parseEther('0.5') // price of gov token
  )
  console.log('deployed House NFT DAO: ', houseDAOGov.address)
  await multiNFT.setApprovalForAll(houseDAONFT.address, true)
  console.log('house nft dao is initialized')

  return {
    weth,
    houseDAOGov,
    houseDAONFT,
    multiNFT,
    govToken,
  }
}
