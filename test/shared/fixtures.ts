import WETH from '../../artifacts/contracts/test/WETH9.sol/WETH9.json'
import GovernanceToken from '../../artifacts/contracts/common/GovernanceToken.sol/GovernanceToken.json'
import HouseDAOGov from '../../artifacts/contracts/HouseDAOGovernance.sol/HouseDAOGovernance.json'
import HouseDAONFT from '../../artifacts/contracts/HouseDAONFT.sol/HouseDAONFT.json'
import MultiNFT from '../../artifacts/contracts/test/NFT.sol/MultiArtToken.json'
import Safe from '../../artifacts/contracts/test/SafeFixture.sol/SafeFixture.json'
import ProxyFactory from '../../artifacts/contracts/test/safe/proxies/GnosisSafeProxyFactory.sol/GnosisSafeProxyFactory.json'

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import "@nomiclabs/hardhat-ethers";
import { ethers, upgrades } from 'hardhat'
import { deployContract } from 'ethereum-waffle'
import { Contract } from 'ethers'

export interface DAOFixture {
  weth: Contract,
  houseDAOGov: Contract,
  houseDAONFT: Contract,
  multiNFT: Contract,
  govToken: Contract,
  safe: Contract,
  proxy: Contract
}

export async function getFixtureWithParams(
  wallet: SignerWithAddress,
  fromWallet: boolean = true
): Promise<any> {

  const wethContract = await ethers.getContractFactory("WETH9")
  // deploy tokens
  const weth = await wethContract.deploy() 
  console.log(weth.deployTransaction.gasLimit.toString())
  console.log('deployed weth: ', weth.address)

  const govTokenContract = await ethers.getContractFactory("GovernanceToken")
  const govToken = await govTokenContract.deploy("GovToken", "GT", ethers.BigNumber.from('100000000000000000000000'))
  console.log(govToken.deployTransaction.gasLimit.toString())
  console.log("deployed governance token: ", govToken.address)

  const multiArtToken = await ethers.getContractFactory("MultiArtToken")
  const multiNFT = await multiArtToken.deploy("Walk", "TWT")
  console.log(multiNFT.deployTransaction.gasLimit.toString())
  console.log('deployed TokenWalk Domain: ', multiNFT.address)
  await multiNFT.mintEdition(['https://gateway.ipfs.io/ipfs/QmZuwWhEGkUKZgC2GzNrfCRKcrKbxYxskjSnTgpMQY9Dy2/metadata/'], 1, wallet.address, {gasLimit:12450000})
  await multiNFT.mintEdition(['https://gateway.ipfs.io/ipfs/QmZuwWhEGkUKZgC2GzNrfCRKcrKbxYxskjSnTgpMQY9Dy2/metadata/'], 1, wallet.address, {gasLimit:12450000})
  await multiNFT.mintEdition(['https://gateway.ipfs.io/ipfs/QmZuwWhEGkUKZgC2GzNrfCRKcrKbxYxskjSnTgpMQY9Dy2/metadata/'], 1, wallet.address, {gasLimit:12450000})
  await multiNFT.mintEdition(['https://gateway.ipfs.io/ipfs/QmZuwWhEGkUKZgC2GzNrfCRKcrKbxYxskjSnTgpMQY9Dy2/metadata/'], 1, wallet.address, {gasLimit:12450000})

  // const houseGovContract = await ethers.getContractFactory("HouseDAOGovernance")
  const houseDAOGov = await wethContract.deploy()
  // const houseDAOGov = await houseGovContract.deploy(
  //  [wallet.address], // head of house
  //  govToken.address, // gov token addres
  //  //ethers.BigNumber.from(1000000), // min entry fee in gov tokens
  //  ethers.BigNumber.from(1), // number of days proposals are active
  //  ethers.BigNumber.from('50000000000000000000000'), // total gov tokens supplied to contract
  //  ethers.BigNumber.from('1000000000000000000'), // number of votes wieghted to pass
  //  ethers.BigNumber.from('10000'), // min proposal gov token amt
  //  //ethers.BigNumber.from('1000000000000000000'), // reward for entry in gov token
  //  weth.address
  // )
  // console.log('deployed House ERC20 DAO: ', houseDAOGov.address)
  // await govToken.approve(houseDAOGov.address, ethers.BigNumber.from('50000000000000000000000'))
  // await houseDAOGov.init()

  // const houseNFTContract = await ethers.getContractFactory("HouseDAONFT")
  const houseDAONFT = await wethContract.deploy()
  // const houseDAONFT = await houseNFTContract.deploy(
  //  [wallet.address], // head of house
  //  multiNFT.address, // gov token addres
  //  //wallet.address, // nft vault address
  //  //ethers.BigNumber.from(1), // start index of gov tokens
  //  ethers.BigNumber.from(1), // number of days proposals are active
  //  ethers.BigNumber.from(5), // number of votes wieghted to pass
  //  ethers.BigNumber.from(1), // min proposal gov token amt
  //  //ethers.BigNumber.from(75), // issuance supply
  //  weth.address,
  //  ethers.utils.parseEther('0.5'), // price of gov token
  // )
  // console.log('deployed House NFT DAO: ', houseDAOGov.address)
  // await multiNFT.setDAOAddress(houseDAONFT.address)
  // //await multiNFT.setApprovalForAll(houseDAONFT.address, true)
  // console.log('house nft dao is initialized')


  const safeContract = await ethers.getContractFactory("SafeFixture")
  const FactoryContract = await ethers.getContractFactory("GnosisSafeProxyFactory")
  const ProxyContract = await ethers.getContractFactory("GnosisSafeProxy")
  const factory = await FactoryContract.deploy()
  //const safe = await safeContract.deploy()
  const safeABI = ["function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)"]
  const iface = new ethers.utils.Interface(safeABI);

  let owner1SafeData = await iface.encodeFunctionData(
      "setup",
      [[wallet.address], 1, wallet.address, "0x", wallet.address, wallet.address, 0, wallet.address]
  )

  const safe = await upgrades.deployProxy(safeContract, [owner1SafeData], {initializer: 'setup'})

  let tx = await factory.createProxy(safe.address, owner1SafeData)
  let receipt = await tx.wait()
  let event = receipt.events?.filter((x: any) => {return x.event == "ProxyCreation"})
  let proxyAddress = event[0].args[0]
  console.log(proxyAddress)
  const proxy = await ProxyContract.attach(proxyAddress)
  console.log(safe.deployTransaction.gasLimit.toString())
  console.log('deployed Gnosis Safe: ', safe.address)
  console.log(proxy)
  let ownerCount = await proxy.nonce()
  console.log(ownerCount)
  console.log("Gnosis Safe is setup")

  return {
    weth,
    houseDAOGov,
    houseDAONFT,
    multiNFT,
    govToken,
    safe,
    proxy
  }
}
