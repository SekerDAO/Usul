import { expect } from "chai";
import { BigNumber } from "ethers";
import hre, { ethers, network, waffle, deployments } from "hardhat";
import { _TypedDataEncoder } from "@ethersproject/hash";
import {
  executeContractCallWithSigners,
  buildContractCall,
} from "./shared/utils";
import { AddressZero } from "@ethersproject/constants";
import { signTypedMessage, TypedDataUtils } from "eth-sig-util";
import { ecsign } from "ethereumjs-util";
import Wallet from "ethereumjs-wallet";

const deadline =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

describe("SingleVotingStrategy:", () => {
  const [wallet_0, wallet_1, wallet_2, wallet_3] = waffle.provider.getWallets();
  const chainId = ethers.BigNumber.from(network.config.chainId).toNumber();
  const tx = {
    to: wallet_1.address,
    value: 0,
    data: "0x",
    operation: 0,
    nonce: 0,
  };
  const baseSetup = deployments.createFixture(async () => {
    await deployments.fixture();
    const [wallet_0, wallet_1, wallet_2, wallet_3] =
      waffle.provider.getWallets();
    const defaultBalance = ethers.BigNumber.from("1");
    const thresholdBalance = ethers.BigNumber.from("2");
    const totalSupply = ethers.BigNumber.from("100000000000000000000000");
    const govTokenContract = await ethers.getContractFactory("GovernanceToken");
    const govToken = await govTokenContract.deploy(
      "GovToken",
      "GT",
      totalSupply
    );
    await govToken.transfer(wallet_1.address, defaultBalance);
    await govToken.transfer(wallet_2.address, defaultBalance);
    await govToken.transfer(wallet_3.address, defaultBalance);
    await govToken.delegate(wallet_0.address);
    await govToken.connect(wallet_1).delegate(wallet_1.address);
    await govToken.connect(wallet_2).delegate(wallet_2.address);
    await govToken.connect(wallet_3).delegate(wallet_3.address);

    const GnosisSafeL2 = await hre.ethers.getContractFactory(
      "@gnosis.pm/safe-contracts/contracts/GnosisSafeL2.sol:GnosisSafeL2"
    );
    const FactoryContract = await hre.ethers.getContractFactory(
      "@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol:GnosisSafeProxyFactory"
    );
    const singleton = await GnosisSafeL2.deploy();
    const factory = await FactoryContract.deploy();
    const template = await factory.callStatic.createProxy(
      singleton.address,
      "0x"
    );
    await factory
      .createProxy(singleton.address, "0x")
      .then((tx: any) => tx.wait());
    const safe = GnosisSafeL2.attach(template);
    safe.setup(
      [wallet_0.address],
      1,
      AddressZero,
      "0x",
      AddressZero,
      AddressZero,
      0,
      AddressZero
    );

    const moduleFactoryContract = await ethers.getContractFactory(
      "ModuleProxyFactory"
    );
    const moduleFactory = await moduleFactoryContract.deploy();
    const proposalContract = await ethers.getContractFactory("Usul");
    const masterProposalModule = await proposalContract.deploy(
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001",
      []
    );
    const encodedInitParams = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "address", "address[]"],
      [safe.address, safe.address, safe.address, []]
    );
    const initData = masterProposalModule.interface.encodeFunctionData(
      "setUp",
      [encodedInitParams]
    );
    const masterCopyAddress = masterProposalModule.address
      .toLowerCase()
      .replace(/^0x/, "");
    const byteCode =
      "0x602d8060093d393df3363d3d373d3d3d363d73" +
      masterCopyAddress +
      "5af43d82803e903d91602b57fd5bf3";
    const salt = ethers.utils.solidityKeccak256(
      ["bytes32", "uint256"],
      [ethers.utils.solidityKeccak256(["bytes"], [initData]), "0x01"]
    );
    const expectedAddress = ethers.utils.getCreate2Address(
      moduleFactory.address,
      salt,
      ethers.utils.keccak256(byteCode)
    );
    expect(
      await moduleFactory.deployModule(
        masterProposalModule.address,
        initData,
        "0x01"
      )
    )
      .to.emit(moduleFactory, "ModuleProxyCreation")
      .withArgs(expectedAddress, masterProposalModule.address);
    const proposalModule = proposalContract.attach(expectedAddress);

    const SingleContract = await ethers.getContractFactory("OZSingleVoting");
    const masterSingleVoting = await SingleContract.deploy(
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001",
      2, // number of votes wieghted to pass
      1,
      1, // number of days proposals are active
      ""
    );
    const encodedSingleVotingInitParams = ethers.utils.defaultAbiCoder.encode(
      [
        "address",
        "address",
        "address",
        "uint256",
        "uint256",
        "uint256",
        "string",
      ],
      [
        wallet_0.address,
        govToken.address,
        proposalModule.address,
        60,
        thresholdBalance, // number of votes wieghted to pass
        60, // number of days proposals are active
        "Test",
      ]
    );
    const initSingleVotingData =
      masterSingleVoting.interface.encodeFunctionData("setUp", [
        encodedSingleVotingInitParams,
      ]);
    const masterCopySingleVotingAddress = masterSingleVoting.address
      .toLowerCase()
      .replace(/^0x/, "");
    const byteCodeSingleVoting =
      "0x602d8060093d393df3363d3d373d3d3d363d73" +
      masterCopySingleVotingAddress +
      "5af43d82803e903d91602b57fd5bf3";
    const saltSingleVoting = ethers.utils.solidityKeccak256(
      ["bytes32", "uint256"],
      [
        ethers.utils.solidityKeccak256(["bytes"], [initSingleVotingData]),
        "0x01",
      ]
    );
    const expectedAddressSingleVoting = ethers.utils.getCreate2Address(
      moduleFactory.address,
      saltSingleVoting,
      ethers.utils.keccak256(byteCodeSingleVoting)
    );
    expect(
      await moduleFactory.deployModule(
        masterSingleVoting.address,
        initSingleVotingData,
        "0x01"
      )
    )
      .to.emit(moduleFactory, "ModuleProxyCreation")
      .withArgs(expectedAddressSingleVoting, masterSingleVoting.address);
    const singleVoting = masterSingleVoting.attach(expectedAddressSingleVoting);

    const addCall = buildContractCall(
      safe,
      "addOwnerWithThreshold",
      [wallet_1.address, 1],
      await safe.nonce()
    );
    const addCall_1 = buildContractCall(
      safe,
      "addOwnerWithThreshold",
      [wallet_2.address, 1],
      await safe.nonce()
    );
    const txHash = await proposalModule.getTransactionHash(
      addCall.to,
      addCall.value,
      addCall.data,
      addCall.operation
    );
    const txHash_1 = await proposalModule.getTransactionHash(
      addCall_1.to,
      addCall_1.value,
      addCall_1.data,
      addCall_1.operation
    );
    await executeContractCallWithSigners(
      safe,
      safe,
      "enableModule",
      [proposalModule.address],
      [wallet_0]
    );
    await executeContractCallWithSigners(
      safe,
      proposalModule,
      "enableStrategy",
      [singleVoting.address],
      [wallet_0]
    );

    return {
      proposalModule,
      singleVoting,
      txHash,
      txHash_1,
      addCall,
      addCall_1,
      safe,
      defaultBalance,
      thresholdBalance,
      govToken,
    };
  });

  describe("setUp", async () => {
    it("can register linear voting module", async () => {
      const { proposalModule, singleVoting } = await baseSetup();
      expect(
        await proposalModule.isStrategyEnabled(singleVoting.address)
      ).to.equal(true);
    });

    it("linear state is initialized correctly", async () => {
      const { singleVoting, safe } = await baseSetup();
      expect(await singleVoting.votingPeriod()).to.equal(60);
      expect(await singleVoting.quorumThreshold()).to.equal(2);
      expect(await singleVoting.timeLockPeriod()).to.equal(60);
    });
  });

  describe("single voting modules", async () => {
    it("can vote past the threshold singleVoting", async () => {
      const { proposalModule, singleVoting, safe, addCall, txHash } =
        await baseSetup();
      await proposalModule.submitProposal([txHash], singleVoting.address, "0x");
      const proposal = await singleVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(ethers.BigNumber.from(0));
      await singleVoting.vote(0, 1);
      await singleVoting.connect(wallet_1).vote(0, 1);
      const proposalAfterVoting = await singleVoting.proposals(0);
      expect(proposalAfterVoting.yesVotes).to.equal(ethers.BigNumber.from(2));
      expect(await singleVoting.hasVoted(0, wallet_0.address)).to.equal(true);
      expect(await singleVoting.hasVoted(0, wallet_1.address)).to.equal(true);
    });

    it("can vote on multiple proposals", async () => {
      const {
        proposalModule,
        safe,
        singleVoting,
        addCall,
        txHash,
        addCall_1,
        txHash_1,
      } = await baseSetup();
      await proposalModule.submitProposal([txHash], singleVoting.address, "0x");
      await proposalModule
        .connect(wallet_1)
        .submitProposal([txHash_1], singleVoting.address, "0x");
      await singleVoting.connect(wallet_1).vote(0, 1);
      await singleVoting.connect(wallet_1).vote(1, 1);
      await singleVoting.vote(0, 1);
      await singleVoting.vote(1, 1);
      await network.provider.send("evm_increaseTime", [60]);
      await singleVoting.finalizeStrategy(0);
      await singleVoting.finalizeStrategy(1);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        safe.address, // target
        0, // value
        addCall.data, // data
        0 // call operation
      );
      await proposalModule.executeProposalByIndex(
        1, // proposalId
        safe.address, // target
        0, // value
        addCall_1.data, // data
        0 // call operation
      );
      const owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_2.address);
      expect(owners[1]).to.equal(wallet_1.address);
      expect(owners[2]).to.equal(wallet_0.address);
    });

    it("can vote with ERC712 offchain signature", async () => {
      const {
        proposalModule,
        singleVoting,
        safe,
        txHash,
        addCall,
        defaultBalance,
        govToken,
      } = await baseSetup();
      const wallet = Wallet.generate();
      await govToken.delegate(wallet.getAddressString());
      await proposalModule.submitProposal([txHash], singleVoting.address, "0x");
      await network.provider.send("evm_mine");
      expect(
        await singleVoting.calculateWeight(wallet.getAddressString(), 0)
      ).to.equal(defaultBalance);
      const name = "Test";
      const version = "1";
      const verifyingContract = singleVoting.address;
      const EIP712Domain = [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ];
      const domainSeparator =
        "0x" +
        TypedDataUtils.hashStruct(
          "EIP712Domain",
          { name, version, chainId, verifyingContract },
          { EIP712Domain }
        ).toString("hex");

      const message = {
        proposalId: 0,
        vote: 1,
      };
      const data = {
        types: {
          EIP712Domain,
          Vote: [
            { name: "proposalId", type: "uint256" },
            { name: "vote", type: "uint8" },
          ],
        },
        domain: { name, version, chainId, verifyingContract },
        primaryType: "Vote",
        message,
      };
      // @ts-ignore: Unreachable code error
      const signature = signTypedMessage(wallet.getPrivateKey(), { data });
      await singleVoting.voteSignature(0, 1, signature);
      expect(
        await singleVoting.hasVoted(0, wallet.getAddressString())
      ).to.equal(true);
      let proposal = await singleVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(defaultBalance);
    });
  });
});
