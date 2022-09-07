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
import {
  deployMaci,
  deployVkRegistry,
  deployVerifier,
  deployTopupCredit,
} from "maci-contracts";
import { Keypair, PubKey } from "maci-domainobjs";

const deadline =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

describe("Maci Strategy:", () => {
  const [owner, coordinator, user_1, user_2] = waffle.provider.getWallets();
  const chainId = ethers.BigNumber.from(network.config.chainId).toNumber();

  const coodinatorKeyPair = new Keypair();
  const duration = 30; // seconds
  const timeLockPeriod = 1; // seconds
  const maxValues = {
    maxMessages: 25,
    maxVoteOptions: 25,
  };
  const treeDepths = {
    intStateTreeDepth: 2,
    messageTreeSubDepth: 1,
    messageTreeDepth: 32,
    voteOptionTreeDepth: 32,
  };

  const baseSetup = deployments.createFixture(async () => {
    await deployments.fixture();
    const defaultBalance = ethers.BigNumber.from(1);
    const thresholdPercent = ethers.BigNumber.from(100);

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
      [owner.address],
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

    const MaciVotingContract = await ethers.getContractFactory("MACIVoting");
    const MaciVotingMasterCopy = await MaciVotingContract.deploy(
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001",
      coodinatorKeyPair.pubKey.asContractParam(),
      1,
      1,
      maxValues,
      treeDepths
    );

    const coordinatorPubKey = coodinatorKeyPair.pubKey.asContractParam();

    const encodedMaciVotingInitParams = ethers.utils.defaultAbiCoder.encode(
      [
        "address",
        "address",
        "address",
        "tuple(uint256, uint256)",
        "uint256",
        "uint256",
        "tuple(uint256, uint256)",
        "tuple(uint8, uint8, uint8, uint8)",
      ],
      [
        safe.address,
        coordinator.address,
        proposalModule.address,
        [coordinatorPubKey.x, coordinatorPubKey.y],
        duration,
        timeLockPeriod,
        [maxValues.maxMessages, maxValues.maxVoteOptions],
        [
          treeDepths.intStateTreeDepth,
          treeDepths.messageTreeSubDepth,
          treeDepths.messageTreeDepth,
          treeDepths.voteOptionTreeDepth,
        ],
      ]
    );

    const initMACIVotingData =
      MaciVotingMasterCopy.interface.encodeFunctionData("setUp", [
        encodedMaciVotingInitParams,
      ]);

    const masterCopyMaciVotingAddress = MaciVotingMasterCopy.address
      .toLowerCase()
      .replace(/^0x/, "");
    const byteCodeMACIVoting =
      "0x602d8060093d393df3363d3d373d3d3d363d73" +
      masterCopyMaciVotingAddress +
      "5af43d82803e903d91602b57fd5bf3";
    const saltMaciVoting = ethers.utils.solidityKeccak256(
      ["bytes32", "uint256"],
      [ethers.utils.solidityKeccak256(["bytes"], [initMACIVotingData]), "0x01"]
    );
    const expectedAddressMaciVoting = ethers.utils.getCreate2Address(
      moduleFactory.address,
      saltMaciVoting,
      ethers.utils.keccak256(byteCodeMACIVoting)
    );

    await expect(
      await moduleFactory.deployModule(
        MaciVotingMasterCopy.address,
        initMACIVotingData,
        "0x01"
      )
    )
      .to.emit(moduleFactory, "ModuleProxyCreation")
      .withArgs(expectedAddressMaciVoting, MaciVotingMasterCopy.address);
    const maciVoting = MaciVotingMasterCopy.attach(expectedAddressMaciVoting);

    // deploy MACI
    const vkRegistry = await deployVkRegistry();
    const verifierContract = await deployVerifier();
    const topUpContract = await deployTopupCredit();
    const maci = await deployMaci(
      maciVoting.address,
      maciVoting.address,
      verifierContract.address,
      vkRegistry.address,
      topUpContract.address
    );

    // set maci on maciVoting
    const setMaci = buildContractCall(
      maciVoting,
      "setMaci",
      maci.maciContract.address,
      await safe.nonce()
    );
    const setMaciTxHash = await proposalModule.getTransactionHash(
      setMaci.to,
      setMaci.value,
      setMaci.data,
      setMaci.operation
    );
    await executeContractCallWithSigners(
      safe,
      maciVoting,
      "setMaci",
      [maci.maciContract.address],
      [owner]
    );

    const addCall = buildContractCall(
      safe,
      "addOwnerWithThreshold",
      [coordinator.address, 1],
      await safe.nonce()
    );
    const addCall_1 = buildContractCall(
      safe,
      "addOwnerWithThreshold",
      [user_1.address, 1],
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
      [owner]
    );
    await executeContractCallWithSigners(
      safe,
      proposalModule,
      "enableStrategy",
      [maciVoting.address],
      [owner]
    );

    await executeContractCallWithSigners(
      safe,
      maciVoting,
      "addMember",
      [owner.address],
      [owner]
    );

    return {
      proposalModule,
      maciVoting,
      maci,
      txHash,
      txHash_1,
      addCall,
      addCall_1,
      safe,
      defaultBalance,
      thresholdPercent,
    };
  });

  describe("Deploy the things", async () => {
    it("deploys the things", async () => {
      const { maciVoting, maci } = await baseSetup();
      expect(await maciVoting.maci()).to.equal(
        await maci.maciContract.address()
      );
    });
  });

  // describe("setUp", async () => {
  //   it("can register linear voting module", async () => {
  //     const { proposalModule, maciVoting } = await baseSetup();
  //     expect(
  //       await proposalModule.isStrategyEnabled(maciVoting.address)
  //     ).to.equal(true);
  //   });

  //   it("linear state is initialized correctly", async () => {
  //     const { maciVoting, safe } = await baseSetup();
  //     expect(await maciVoting.votingPeriod()).to.equal(60);
  //     let block = ethers.BigNumber.from(
  //       await network.provider.send("eth_blockNumber")
  //     );
  //     await network.provider.send("evm_mine");
  //     expect(await maciVoting.quorum(block)).to.equal(1);
  //     expect(await maciVoting.timeLockPeriod()).to.equal(60);
  //     expect(await maciVoting.members(owner.address)).to.equal(true);
  //   });
  // });

  // describe("single voting modules", async () => {
  //   it("can not vote if not a member", async () => {
  //     const { proposalModule, maciVoting, txHash, defaultBalance } =
  //       await baseSetup();
  //     await proposalModule.submitProposal([txHash], maciVoting.address, "0x");
  //     await network.provider.send("evm_mine");
  //     await expect(
  //       maciVoting.calculateWeight(coordinator.address, 0)
  //     ).to.be.revertedWith("voter is not a member");
  //     await expect(
  //       maciVoting.connect(coordinator).vote(0, 1)
  //     ).to.be.revertedWith("voter is not a member");
  //   });

  //   it("can vote past the threshold maciVoting", async () => {
  //     const { proposalModule, maciVoting, safe, addCall, txHash } =
  //       await baseSetup();
  //     await executeContractCallWithSigners(
  //       safe,
  //       maciVoting,
  //       "addMember",
  //       [coordinator.address],
  //       [owner]
  //     );
  //     await proposalModule.submitProposal([txHash], maciVoting.address, "0x");
  //     const proposal = await maciVoting.proposals(0);
  //     expect(proposal.yesVotes).to.equal(ethers.BigNumber.from(0));
  //     await maciVoting.vote(0, 1);
  //     await maciVoting.connect(coordinator).vote(0, 1);
  //     const proposalAfterVoting = await maciVoting.proposals(0);
  //     expect(proposalAfterVoting.yesVotes).to.equal(ethers.BigNumber.from(2));
  //     expect(await maciVoting.hasVoted(0, owner.address)).to.equal(true);
  //     expect(await maciVoting.hasVoted(0, coordinator.address)).to.equal(
  //       true
  //     );
  //   });

  //   it("can vote on multiple proposals", async () => {
  //     const {
  //       proposalModule,
  //       safe,
  //       maciVoting,
  //       addCall,
  //       txHash,
  //       addCall_1,
  //       txHash_1,
  //     } = await baseSetup();
  //     await executeContractCallWithSigners(
  //       safe,
  //       maciVoting,
  //       "addMember",
  //       [coordinator.address],
  //       [owner]
  //     );
  //     await proposalModule.submitProposal([txHash], maciVoting.address, "0x");
  //     await proposalModule
  //       .connect(coordinator)
  //       .submitProposal([txHash_1], maciVoting.address, "0x");
  //     await maciVoting.connect(coordinator).vote(0, 1);
  //     await maciVoting.connect(coordinator).vote(1, 1);
  //     await maciVoting.vote(0, 1);
  //     await maciVoting.vote(1, 1);
  //     await network.provider.send("evm_increaseTime", [60]);
  //     await maciVoting.finalizeStrategy(0);
  //     await maciVoting.finalizeStrategy(1);
  //     await network.provider.send("evm_increaseTime", [60]);
  //     await proposalModule.executeProposalByIndex(
  //       0, // proposalId
  //       safe.address, // target
  //       0, // value
  //       addCall.data, // data
  //       0 // call operation
  //     );
  //     await proposalModule.executeProposalByIndex(
  //       1, // proposalId
  //       safe.address, // target
  //       0, // value
  //       addCall_1.data, // data
  //       0 // call operation
  //     );
  //     const owners = await safe.getOwners();
  //     expect(owners[0]).to.equal(user_1.address);
  //     expect(owners[1]).to.equal(coordinator.address);
  //     expect(owners[2]).to.equal(owner.address);
  //   });

  //   it("can vote with ERC712 offchain signature", async () => {
  //     const {
  //       proposalModule,
  //       maciVoting,
  //       safe,
  //       txHash,
  //       addCall,
  //       defaultBalance,
  //     } = await baseSetup();
  //     const wallet = Wallet.generate();
  //     await executeContractCallWithSigners(
  //       safe,
  //       maciVoting,
  //       "addMember",
  //       [wallet.getAddressString()],
  //       [owner]
  //     );
  //     await proposalModule.submitProposal([txHash], maciVoting.address, "0x");
  //     await network.provider.send("evm_mine");
  //     expect(
  //       await maciVoting.calculateWeight(wallet.getAddressString(), 0)
  //     ).to.equal(defaultBalance);
  //     const name = "Test";
  //     const version = "1";
  //     const verifyingContract = maciVoting.address;
  //     const EIP712Domain = [
  //       { name: "name", type: "string" },
  //       { name: "version", type: "string" },
  //       { name: "chainId", type: "uint256" },
  //       { name: "verifyingContract", type: "address" },
  //     ];
  //     const domainSeparator =
  //       "0x" +
  //       TypedDataUtils.hashStruct(
  //         "EIP712Domain",
  //         { name, version, chainId, verifyingContract },
  //         { EIP712Domain }
  //       ).toString("hex");

  //     const message = {
  //       proposalId: 0,
  //       vote: 1,
  //     };
  //     const data = {
  //       types: {
  //         EIP712Domain,
  //         Vote: [
  //           { name: "proposalId", type: "uint256" },
  //           { name: "vote", type: "uint8" },
  //         ],
  //       },
  //       domain: { name, version, chainId, verifyingContract },
  //       primaryType: "Vote",
  //       message,
  //     };
  //     // @ts-ignore: Unreachable code error
  //     const signature = signTypedMessage(wallet.getPrivateKey(), { data });
  //     await maciVoting.voteSignature(0, 1, signature);
  //     expect(
  //       await maciVoting.hasVoted(0, wallet.getAddressString())
  //     ).to.equal(true);
  //     let proposal = await maciVoting.proposals(0);
  //     expect(proposal.yesVotes).to.equal(defaultBalance);
  //   });

  //   it("can not add member non-owner", async () => {
  //     const { maciVoting } = await baseSetup();
  //     await expect(maciVoting.addMember(user_1.address)).to.be.revertedWith(
  //       "Ownable: caller is not the owner"
  //     );
  //   });

  //   it("can not remove member non-owner", async () => {
  //     const { maciVoting } = await baseSetup();
  //     await expect(
  //       maciVoting.removeMember(user_1.address)
  //     ).to.be.revertedWith("Ownable: caller is not the owner");
  //   });

  //   it("can add member through admin", async () => {
  //     const { safe, maciVoting } = await baseSetup();
  //     await executeContractCallWithSigners(
  //       safe,
  //       maciVoting,
  //       "addMember",
  //       [owner.address],
  //       [owner]
  //     );
  //     const member = await maciVoting.members(owner.address);
  //     expect(member).to.equal(true);
  //   });

  //   it("can add member through proposal", async () => {
  //     const {
  //       proposalModule,
  //       safe,
  //       maciVoting,
  //       defaultBalance,
  //       thresholdPercent,
  //     } = await baseSetup();
  //     await executeContractCallWithSigners(
  //       safe,
  //       maciVoting,
  //       "addMember",
  //       [coordinator.address],
  //       [owner]
  //     );
  //     const addMemberCall = buildContractCall(
  //       maciVoting,
  //       "addMember",
  //       [user_1.address],
  //       0
  //     );
  //     const txHash = await proposalModule.getTransactionHash(
  //       addMemberCall.to,
  //       addMemberCall.value,
  //       addMemberCall.data,
  //       addMemberCall.operation
  //     );
  //     await proposalModule.submitProposal([txHash], maciVoting.address, "0x");
  //     await network.provider.send("evm_mine");
  //     await maciVoting.vote(0, 1);
  //     await maciVoting.connect(coordinator).vote(0, 1);
  //     let proposal = await maciVoting.proposals(0);
  //     expect(proposal.yesVotes).to.equal(2);
  //     await network.provider.send("evm_increaseTime", [60]);
  //     await maciVoting.finalizeStrategy(0);
  //     expect(await proposalModule.state(0)).to.equal(2);
  //     await network.provider.send("evm_increaseTime", [60]);
  //     await network.provider.send("evm_mine");
  //     expect(await proposalModule.state(0)).to.equal(4);
  //     await proposalModule.executeProposalByIndex(
  //       0, // proposalId
  //       maciVoting.address, // target
  //       0, // value
  //       addMemberCall.data, // data
  //       0 // call operation
  //     );
  //     const member = await maciVoting.members(user_1.address);
  //     expect(member).to.equal(true);
  //     expect(await maciVoting.memberCount()).to.equal(3);
  //   });

  //   it("can remove member through admin", async () => {
  //     const { safe, maciVoting } = await baseSetup();
  //     await executeContractCallWithSigners(
  //       safe,
  //       maciVoting,
  //       "addMember",
  //       [owner.address],
  //       [owner]
  //     );
  //     let member = await maciVoting.members(owner.address);
  //     expect(member).to.equal(true);
  //     expect(await maciVoting.memberCount()).to.equal(2);
  //     await executeContractCallWithSigners(
  //       safe,
  //       maciVoting,
  //       "removeMember",
  //       [owner.address],
  //       [owner]
  //     );
  //     member = await maciVoting.members(owner.address);
  //     expect(member).to.equal(false);
  //     expect(await maciVoting.memberCount()).to.equal(1);
  //   });

  //   it("can remove member through proposal", async () => {
  //     const {
  //       proposalModule,
  //       safe,
  //       maciVoting,
  //       defaultBalance,
  //       thresholdPercent,
  //     } = await baseSetup();
  //     await executeContractCallWithSigners(
  //       safe,
  //       maciVoting,
  //       "addMember",
  //       [coordinator.address],
  //       [owner]
  //     );
  //     const removeMemberCall = buildContractCall(
  //       maciVoting,
  //       "removeMember",
  //       [owner.address],
  //       0
  //     );
  //     const txHash = await proposalModule.getTransactionHash(
  //       removeMemberCall.to,
  //       removeMemberCall.value,
  //       removeMemberCall.data,
  //       removeMemberCall.operation
  //     );
  //     await proposalModule.submitProposal([txHash], maciVoting.address, "0x");
  //     await maciVoting.vote(0, 1);
  //     await maciVoting.connect(coordinator).vote(0, 1);
  //     await network.provider.send("evm_increaseTime", [60]);
  //     await maciVoting.finalizeStrategy(0);
  //     await network.provider.send("evm_increaseTime", [60]);
  //     await network.provider.send("evm_mine");
  //     await proposalModule.executeProposalByIndex(
  //       0, // proposalId
  //       maciVoting.address, // target
  //       0, // value
  //       removeMemberCall.data, // data
  //       0 // call operation
  //     );
  //     const member = await maciVoting.members(owner.address);
  //     expect(member).to.equal(false);
  //     expect(await maciVoting.memberCount()).to.equal(1);
  //   });
  // });
});
