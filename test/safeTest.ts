// import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
// import { expect } from 'chai'
// import { BigNumber, Contract, constants } from 'ethers'
// import { ethers, network, waffle } from 'hardhat'
// import { DAOFixture, getFixtureWithParams } from './shared/fixtures'
// import { executeContractCallWithSigners, buildContractCall, safeSignMessage, executeTx } from './shared/utils'
// import { keccak256 } from 'ethereumjs-util'
// import { defaultSender, provider, web3, contract } from '@openzeppelin/test-environment';

// const zero = ethers.BigNumber.from(0)
// const MaxUint256 = ethers.constants.MaxUint256

// let daoFixture: DAOFixture
// let wallet: SignerWithAddress

// // TODOs:
// // - figure out how to inspect nested mappings
// // - figure out how to get expect reverts working

// describe('houseDAOnft:', () => {
//   const [user1, user2, user3, user4] = waffle.provider.getWallets();

//   beforeEach(async function () {
//     wallet = (await ethers.getSigners())[0]
//     daoFixture = await getFixtureWithParams(wallet, true)
//   })

//   it('gnosis safe is initialized', async () => {
//   	let wallet_1 = (await ethers.getSigners())[0]
//     const { safe } = daoFixture

//     const owners = await safe.getOwners()
//     const version = await safe.VERSION()
//     console.log(version)
//     console.log(wallet.address)
//     console.log(owners)
//     console.log(safe.address)
//   })

//   it('gnosis safe add owner', async () => {
//     let wallet_1 = (await ethers.getSigners())[0]
//     let wallet_2 = (await ethers.getSigners())[1]
//     const { safe } = daoFixture

//     let owners = await safe.getOwners()
//     console.log(owners)
//     //await safe.addOwnerWithThreshold(wallet_2.address, 1)
//     await executeContractCallWithSigners(safe, safe, "addOwnerWithThreshold", [user2.address, 1], [user1])
//     owners = await safe.getOwners()
//     console.log(owners)
//   })

//   it('gnosis safe multi-sig tx', async () => {
//     let wallet_1 = (await ethers.getSigners())[0]
//     let wallet_2 = (await ethers.getSigners())[1]
//     const { safe } = daoFixture

//     let owners = await safe.getOwners()
//     console.log(owners)
//     //await safe.addOwnerWithThreshold(wallet_2.address, 1)
//     await executeContractCallWithSigners(safe, safe, "addOwnerWithThreshold", [user2.address, 2], [user1])
//     owners = await safe.getOwners()
//     console.log(owners)
//     let call = buildContractCall(safe, "addOwnerWithThreshold", [user3.address, 3], await safe.nonce())
//     console.log(call)
//     let signedCall_1 = await safeSignMessage(user1, safe, call)
//     let signedCall_2 = await safeSignMessage(user2, safe, call)
//     await executeTx(safe, call, [signedCall_1, signedCall_2])
//     owners = await safe.getOwners()
//     console.log(owners)
//   })

//   it('gnosis safe enable gov module', async () => {
//     let wallet_1 = (await ethers.getSigners())[0]
//     let wallet_2 = (await ethers.getSigners())[1]
//     const { safe, proposalModule } = daoFixture

//     let owners = await safe.getOwners()
//     console.log(owners)
//     //await safe.addOwnerWithThreshold(wallet_2.address, 1)
//     await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [user1])
//   })

//   it('gnosis safe update owner proposal', async () => {
//     let wallet_1 = (await ethers.getSigners())[0]
//     let wallet_2 = (await ethers.getSigners())[1]
//     const { safe, proposalModule } = daoFixture

//     let owners = await safe.getOwners()
//     console.log(owners)
//     let nonce = await safe.nonce()
//     console.log(nonce)
//     //await safe.addOwnerWithThreshold(wallet_2.address, 1)
//     await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [user1])
//     nonce = await safe.nonce()
//     console.log(nonce)
//     // build transaction to update owner on safe module for proposal
//     let test = buildContractCall(safe, "addOwnerWithThreshold", [user2.address, 1], await safe.nonce())
//     await proposalModule.submitModularProposal(safe.address, 0, test.data)
//     await network.provider.send("evm_increaseTime", [60])
//     await proposalModule.startModularGracePeriod(0)
//     await network.provider.send("evm_increaseTime", [60])
//     await proposalModule.executeModularProposal(0)
//     let proposal = await proposalModule._proposals(0)
//     //console.log(proposal)
//     owners = await safe.getOwners()
//     console.log(owners)
//     let thresh = await proposalModule.threshold()
//     console.log(thresh.toString())
//     let test2 = buildContractCall(proposalModule, "updateThreshold", [10000], await safe.nonce())
//     //console.log(test2)
//     await proposalModule.submitModularProposal(proposalModule.address, 0, test2.data)
//     proposal = await proposalModule._proposals(1)
//     await network.provider.send("evm_increaseTime", [60])
//     await proposalModule.startModularGracePeriod(1)
//     await network.provider.send("evm_increaseTime", [60])
//     await proposalModule.executeModularProposal(1)
//     thresh = await proposalModule.threshold()
//     console.log(thresh.toString())
//     nonce = await safe.nonce()
//     console.log(nonce)
//   })

//   it('gnosis safe can send nft', async () => {
//     let wallet_1 = (await ethers.getSigners())[0]
//     let wallet_2 = (await ethers.getSigners())[1]
//     const { safe, proposalModule, multiNFT } = daoFixture

//     await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [user1])
//     // build transaction to update owner on safe module for proposal
//     let test = buildContractCall(safe, "addOwnerWithThreshold", [user2.address, 1], await safe.nonce())
//     await proposalModule.submitModularProposal(safe.address, 0, test.data)
//     await network.provider.send("evm_increaseTime", [60])
//     await proposalModule.startModularGracePeriod(0)
//     await network.provider.send("evm_increaseTime", [60])
//     await proposalModule.executeModularProposal(0)
//     let test2 = buildContractCall(proposalModule, "updateThreshold", [10000], await safe.nonce())
//     await proposalModule.submitModularProposal(proposalModule.address, 0, test2.data)
//     await network.provider.send("evm_increaseTime", [60])
//     await proposalModule.startModularGracePeriod(1)
//     await network.provider.send("evm_increaseTime", [60])
//     await proposalModule.executeModularProposal(1)

//     await multiNFT.transferFrom(wallet_1.address, safe.address, 1)
//     let isOwner = await multiNFT.ownerOf(1)
//     console.log(safe.address)
//     console.log(isOwner)
//     await executeContractCallWithSigners(safe, multiNFT, "transferFrom", [safe.address, wallet_1.address, 1], [user1])
//     isOwner = await multiNFT.ownerOf(1)
//     console.log(wallet_1.address)
//     console.log(isOwner)
//   })

//   it('gnosis safe can execute zora auction', async () => {
//     let wallet_1 = (await ethers.getSigners())[0]
//     let wallet_2 = (await ethers.getSigners())[1]
//     const { safe, proposalModule, multiNFT, auction, weth } = daoFixture

//     await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [user1])
//     // build transaction to update owner on safe module for proposal
//     await multiNFT.transferFrom(wallet_1.address, safe.address, 1)
//     let isOwner = await multiNFT.ownerOf(1)
//     console.log(isOwner)
//     console.log(safe.address)
//     let call = buildContractCall(
//         multiNFT,
//         "approve",
//         [auction.address, 1],
//         await safe.nonce()
//     )
//     await proposalModule.submitModularProposal(multiNFT.address, 0, call.data)
//     await network.provider.send("evm_increaseTime", [60])
//     await proposalModule.startModularGracePeriod(0)
//     await network.provider.send("evm_increaseTime", [60])
//     await proposalModule.executeModularProposal(0)
//     let approved = await multiNFT.getApproved(1)
//     console.log(approved)
//     console.log(auction.address)
//     //     uint256 tokenId,
//     //     address tokenContract,
//     //     uint256 duration,
//     //     uint256 reservePrice,
//     //     address payable curator,
//     //     uint8 curatorFeePercentage,
//     //     address auctionCurrency
//     const reservePrice = BigNumber.from(10).pow(18).div(2)
//     call = buildContractCall(
//         auction,
//         "createAuction",
//         [1, multiNFT.address, 86400, reservePrice, safe.address, 10, weth.address],
//         await safe.nonce()
//     )
//     await proposalModule.submitModularProposal(auction.address, 0, call.data)
//     await network.provider.send("evm_increaseTime", [60])
//     await proposalModule.startModularGracePeriod(1)
//     await network.provider.send("evm_increaseTime", [60])
//     await proposalModule.executeModularProposal(1)
//     let a1 = await auction.auctions(0)
//     console.log(a1)
//     let proposal = await proposalModule._proposals(0)
//     //console.log(proposal)
//   })

//   it('gnosis safe can burn last owner', async () => {
//     let wallet_1 = (await ethers.getSigners())[0]
//     let wallet_2 = (await ethers.getSigners())[1]
//     const { safe, proposalModule } = daoFixture

//     await executeContractCallWithSigners(safe, safe, "enableModule", [proposalModule.address], [user1])

//     let owners = await safe.getOwners()
//     console.log(owners)
//     //await safe.addOwnerWithThreshold(wallet_2.address, 1)
//     await executeContractCallWithSigners(safe, safe, "addOwnerWithThreshold", [user2.address, 1], [user1])
//     await executeContractCallWithSigners(safe, safe, "addOwnerWithThreshold", [user3.address, 1], [user1])
//     owners = await safe.getOwners()
//     console.log(owners)

//     let swap = buildContractCall(safe, "swapOwner", [user2.address, user2.address, user4.address], await safe.nonce())
//     await executeContractCallWithSigners(safe, safe, "swapOwner", [user2.address, user1.address, "0x0000000000000000000000000000000000001337"], [user1])
//     owners = await safe.getOwners()
//     console.log(owners)

//     let burn = buildContractCall(safe, "removeOwner", [user3.address, user2.address, 1], await safe.nonce())
//     await executeContractCallWithSigners(safe, safe, "removeOwner", [user3.address, user2.address, 2], [user3])
//     owners = await safe.getOwners()
//     console.log(owners)

//     //expect revert
//     //await executeContractCallWithSigners(safe, safe, "addOwnerWithThreshold", [user1.address, 1], [user3])

//     let restore = buildContractCall(safe, "changeThreshold", [1], await safe.nonce())
//     console.log(restore)
//     // can use proposal to restore
//     //await proposalModule.restoreFederation(restore.data)
//     await proposalModule.submitModularProposal(safe.address, 0, restore.data)
//     await network.provider.send("evm_increaseTime", [60])
//     await proposalModule.startModularGracePeriod(0)
//     await network.provider.send("evm_increaseTime", [60])
//     await proposalModule.executeModularProposal(0)

//     await executeContractCallWithSigners(safe, safe, "addOwnerWithThreshold", [user1.address, 1], [user3])
//     owners = await safe.getOwners()
//     console.log(owners)
//   })
// })
