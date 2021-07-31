import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { AddressZero } from "@ethersproject/constants";
import hre, { ethers, upgrades, deployments, waffle } from 'hardhat'
import { deployContract } from 'ethereum-waffle'
import { Contract } from 'ethers'
import ZoraAuction from "../../node_modules/@zoralabs/auction-house/dist/artifacts/AuctionHouse.sol/AuctionHouse.json"

export interface DAOFixture {
  weth: Contract,
  DAOGov: Contract,
  //houseDAONFT: Contract,
  multiNFT: Contract,
  govToken: Contract,
  safe: Contract,
  proxy: Contract,
  auction: Contract
}

export async function getFixtureWithParams(
  wallet: SignerWithAddress,
  fromWallet: boolean = true
): Promise<any> {

  const wethContract = await ethers.getContractFactory("WETH9")
  // deploy tokens
  const weth = await wethContract.deploy() 
  console.log('WETH Deploy Cost ' + weth.deployTransaction.gasLimit.toString())
  console.log('deployed weth: ', weth.address)

  const govTokenContract = await ethers.getContractFactory("GovernanceToken")
  const govToken = await govTokenContract.deploy("GovToken", "GT", ethers.BigNumber.from('100000000000000000000000'))
  console.log('Gov Token Deploy Cost ' + govToken.deployTransaction.gasLimit.toString())
  console.log("deployed governance token: ", govToken.address)

  const multiArtToken = await ethers.getContractFactory("MultiArtToken")
  const multiNFT = await multiArtToken.deploy("Walk", "TWT")
  console.log('Multi-NFT Deploy Cost ' + multiNFT.deployTransaction.gasLimit.toString())
  console.log('deployed TokenWalk Domain: ', multiNFT.address)
  await multiNFT.mintEdition(['https://gateway.ipfs.io/ipfs/QmZuwWhEGkUKZgC2GzNrfCRKcrKbxYxskjSnTgpMQY9Dy2/metadata/'], 1, wallet.address, {gasLimit:12450000})
  await multiNFT.mintEdition(['https://gateway.ipfs.io/ipfs/QmZuwWhEGkUKZgC2GzNrfCRKcrKbxYxskjSnTgpMQY9Dy2/metadata/'], 1, wallet.address, {gasLimit:12450000})
  await multiNFT.mintEdition(['https://gateway.ipfs.io/ipfs/QmZuwWhEGkUKZgC2GzNrfCRKcrKbxYxskjSnTgpMQY9Dy2/metadata/'], 1, wallet.address, {gasLimit:12450000})
  await multiNFT.mintEdition(['https://gateway.ipfs.io/ipfs/QmZuwWhEGkUKZgC2GzNrfCRKcrKbxYxskjSnTgpMQY9Dy2/metadata/'], 1, wallet.address, {gasLimit:12450000})

  // const NFTGovernanceContract = await ethers.getContractFactory("NFTGovernance")
  // const NFTGovernance = await NFTGovernanceContract.deploy(
  //  [wallet.address], // head of house
  //  multiNFT.address, // gov token addres
  //  ethers.BigNumber.from(1), // number of days proposals are active
  //  ethers.BigNumber.from(5), // number of votes wieghted to pass
  //  ethers.BigNumber.from(1), // min proposal gov token amt
  //  weth.address,
  //  ethers.utils.parseEther('0.5'), // price of gov token
  // )
  // console.log('NFTDAO Deploy Cost ' + NFTGovernance.deployTransaction.gasLimit.toString())
  // console.log('deployed NFT DAO: ', NFTGovernance.address)
  // await multiNFT.setDAOAddress(NFTGovernance.address)
  // console.log('house nft dao is initialized')


  const GnosisSafeL2 = await hre.ethers.getContractFactory("@gnosis.pm/safe-contracts/contracts/GnosisSafeL2.sol:GnosisSafeL2")
  const FactoryContract = await hre.ethers.getContractFactory("GnosisSafeProxyFactory")
  const singleton = await GnosisSafeL2.deploy()
  console.log('Gnosis Safe Deploy Cost ' + singleton.deployTransaction.gasLimit.toString())
  const factory = await FactoryContract.deploy()
  const template = await factory.callStatic.createProxy(singleton.address, "0x")
  await factory.createProxy(singleton.address, "0x").then((tx: any) => tx.wait())
  const safe = GnosisSafeL2.attach(template);
  safe.setup([wallet.address], 1, AddressZero, "0x", AddressZero, AddressZero, 0, AddressZero)
  console.log("Gnosis Safe is setup")

  const daoGovContract = await ethers.getContractFactory("Governance")
  const DAOGov = await daoGovContract.deploy(
    govToken.address, // gov token addres
    safe.address,
    ethers.BigNumber.from(1), // number of days proposals are active
    ethers.BigNumber.from('1000000000000000000'), // number of votes wieghted to pass
    ethers.BigNumber.from('10000'), // min proposal gov token amt
    wallet.address
  )
  console.log('deployed House ERC20 DAO: ', DAOGov.address)
  await govToken.transfer(safe.address, ethers.BigNumber.from('50000000000000000000000'))

  const auction = await deployContract(wallet as any, ZoraAuction, [multiNFT.address, weth.address]) //await hre.ethers.getContractFactory(ZoraAuction)

  return {
    weth,
    DAOGov,
    //NFTGovernance,
    multiNFT,
    govToken,
    safe,
    factory,
    auction
  }
}
