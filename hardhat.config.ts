import {subtask} from "hardhat/config"
import {TASK_NODE_SERVER_READY} from "hardhat/builtin-tasks/task-names"
import "@nomiclabs/hardhat-ethers"
import {readFileSync} from "fs"
import {join} from "path"

subtask(TASK_NODE_SERVER_READY).setAction(async (args, hre) => {
	const wallet = (await hre.ethers.getSigners())[0]
	const wethContract = await hre.ethers.getContractFactory("WETH9")

	// deploy tokens
	const weth = await wethContract.deploy()
	console.log("deployed weth: ", weth.address)

	const govTokenContract = await hre.ethers.getContractFactory("GovernanceToken")
	const govToken = await govTokenContract.deploy(
		"GovToken",
		"GT",
		hre.ethers.BigNumber.from("100000000000000000000000")
	)
	console.log("deployed governance token: ", govToken.address)

	const multiArtToken = await hre.ethers.getContractFactory("MultiArtToken")
	const multiNFT = await multiArtToken.deploy("Walk", "TWT")
	console.log("deployed TokenWalk Domain: ", multiNFT.address)

	const houseGovContract = await hre.ethers.getContractFactory("HouseDAOGovernance")
	const houseDAOGov = await houseGovContract.deploy(
		[wallet.address], // head of house
		govToken.address, // gov token address
		//ethers.BigNumber.from(1000000), // min entry fee in gov tokens
		hre.ethers.BigNumber.from(1), // number of days proposals are active
		hre.ethers.BigNumber.from("50000000000000000000000"), // total gov tokens supplied to contract
		hre.ethers.BigNumber.from("1000000000000000000"), // number of votes wieghted to pass
		hre.ethers.BigNumber.from("10000"), // min proposal gov token amt
		//ethers.BigNumber.from('1000000000000000000'), // reward for entry in gov token
		weth.address
	)
	console.log("deployed House ERC20 DAO: ", houseDAOGov.address)
	await govToken.approve(houseDAOGov.address, hre.ethers.BigNumber.from("50000000000000000000000"))
	await houseDAOGov.init()

	const houseNFTContract = await hre.ethers.getContractFactory("HouseDAONFT")
	const houseDAONFT = await houseNFTContract.deploy(
		[wallet.address], // head of house
		multiNFT.address, // gov token address
		//wallet.address, // nft vault address
		//ethers.BigNumber.from(1), // start index of gov tokens
		hre.ethers.BigNumber.from(1), // number of days proposals are active
		hre.ethers.BigNumber.from(5), // number of votes wieghted to pass
		hre.ethers.BigNumber.from(1), // min proposal gov token amt
		//ethers.BigNumber.from(75), // issuance supply
		weth.address,
		hre.ethers.utils.parseEther("0.5") // price of gov token
	)
	console.log("deployed House NFT DAO: ", houseDAOGov.address)
	await multiNFT.setDAOAddress(houseDAONFT.address)
	//await multiNFT.setApprovalForAll(houseDAONFT.address, true)
	console.log("house nft dao is initialized")

	const deployer = readFileSync(join(__dirname, "./address-local.txt")).toString().trim()
	await hre.network.provider.send("hardhat_setBalance", [deployer, "0x21e19e0c9bab2400000"])
	console.log(`Setting eth balance for ${deployer}`)

	console.log("Initialization successful")
})

module.exports = {
	solidity: "0.8.0"
}
