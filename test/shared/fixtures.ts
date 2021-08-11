import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { AddressZero } from "@ethersproject/constants";
import hre, { ethers, upgrades, deployments, waffle } from 'hardhat'
import { deployContract } from 'ethereum-waffle'
import { Contract } from 'ethers'
import ZoraAuction from "../../node_modules/@zoralabs/auction-house/dist/artifacts/AuctionHouse.sol/AuctionHouse.json"

export interface DAOFixture {
  weth: Contract,
  proposalModule: Contract,
  linearVoting: Contract,
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
  const [wallet_0, wallet_1, wallet_2, wallet_3] = waffle.provider.getWallets();
  const wethContract = await ethers.getContractFactory("WETH9")
  const weth = await wethContract.deploy() 
  console.log('WETH Deploy Cost ' + weth.deployTransaction.gasLimit.toString())
  console.log('deployed weth: ', weth.address)

  const govTokenContract = await ethers.getContractFactory("GovernanceToken")
  const govToken = await govTokenContract.deploy("GovToken", "GT", ethers.BigNumber.from('100000000000000000000000'))
  await govToken.transfer(wallet_1.address, ethers.BigNumber.from('1000000000000000000'))
  await govToken.transfer(wallet_2.address, ethers.BigNumber.from('1000000000000000000'))
  await govToken.transfer(wallet_3.address, ethers.BigNumber.from('1000000000000000000'))
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

  const proposalContract = await ethers.getContractFactory("ProposalModule")
  const proposalModule = await proposalContract.deploy(
    ethers.BigNumber.from(1), // number of days proposals are active
    ethers.BigNumber.from('1000000000000000000'), // number of votes wieghted to pass
    ethers.BigNumber.from('10000'), // min proposal gov token amt
  )
  await proposalModule.setExecutor(safe.address);
  console.log('deployed House ERC20 DAO: ', proposalModule.address)

  const linearContract = await ethers.getContractFactory("LinearVoting")
  const linearVoting = await linearContract.deploy(govToken.address, proposalModule.address, 180)

  await govToken.transfer(safe.address, ethers.BigNumber.from('50000000000000000000000'))

  const auction = await deployContract(wallet as any, ZoraAuction, [multiNFT.address, weth.address]) //await hre.ethers.getContractFactory(ZoraAuction)

  return {
    weth,
    proposalModule,
    linearVoting,
    multiNFT,
    govToken,
    safe,
    factory,
    auction
  }
}
