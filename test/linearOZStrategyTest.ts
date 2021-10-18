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

describe("linearOZVotingStrategy:", () => {
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
    const defaultBalance = ethers.BigNumber.from("1000000000000000000");
    const thresholdBalance = ethers.BigNumber.from("2000000000000000000");
    const totalSupply = ethers.BigNumber.from("100000000000000000000000");
    const safeSupply = ethers.BigNumber.from("50000000000000000000000");
    const govTokenContract = await ethers.getContractFactory("GovernanceToken");
    const govToken = await govTokenContract.deploy(
      "GovToken",
      "GT",
      totalSupply
    );
    await govToken.transfer(wallet_1.address, defaultBalance);
    await govToken.transfer(wallet_2.address, defaultBalance);
    await govToken.transfer(wallet_3.address, defaultBalance);

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

    const moduleFactoryContract = await ethers.getContractFactory("ModuleProxyFactory")
    const moduleFactory = await moduleFactoryContract.deploy()
    const proposalContract = await ethers.getContractFactory("Seele");
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
    const initData = masterProposalModule.interface.encodeFunctionData("setUp", [
      encodedInitParams,
    ]);
    const masterCopyAddress = masterProposalModule.address.toLowerCase().replace(/^0x/, "");
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
    expect(await moduleFactory.deployModule(masterProposalModule.address, initData, "0x01"))
      .to.emit(moduleFactory, "ModuleProxyCreation")
      .withArgs(expectedAddress, masterProposalModule.address);
    const proposalModule = proposalContract.attach(expectedAddress)

    const linearContract = await ethers.getContractFactory("OZLinearVoting");
    const linearVoting = await linearContract.deploy(
      safe.address,
      govToken.address,
      proposalModule.address,
      thresholdBalance, // number of votes wieghted to pass
      60,
      ethers.BigNumber.from(60), // number of days proposals are active
      "Test"
    );

    const memberLinearContract = await ethers.getContractFactory("MemberLinearVoting");
    const memberLinearVoting = await memberLinearContract.deploy(
      safe.address,
      govToken.address,
      proposalModule.address,
      thresholdBalance, // number of votes wieghted to pass
      60,
      ethers.BigNumber.from(60), // number of days proposals are active
      "Test"
    );

    await govToken.transfer(safe.address, safeSupply);
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
      addCall.operation,
      0
    );
    const txHash_1 = await proposalModule.getTransactionHash(
      addCall_1.to,
      addCall_1.value,
      addCall_1.data,
      addCall_1.operation,
      0
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
      [linearVoting.address],
      [wallet_0]
    );
    await executeContractCallWithSigners(
      safe,
      proposalModule,
      "enableStrategy",
      [memberLinearVoting.address],
      [wallet_0]
    );

    return {
      proposalModule,
      linearVoting,
      memberLinearVoting,
      govToken,
      factory,
      txHash,
      txHash_1,
      addCall,
      addCall_1,
      safe,
      defaultBalance,
      thresholdBalance,
    };
  });

  describe("setUp", async () => {
    it("can register linear voting module", async () => {
      const { proposalModule, linearVoting } = await baseSetup();
      expect(
        await proposalModule.isStrategyEnabled(linearVoting.address)
      ).to.equal(true);
    });

    it("only owner can register linear voting module", async () => {
      const { proposalModule, linearVoting } = await baseSetup();
      await expect(
        proposalModule.enableStrategy(linearVoting.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("state is initialized correctly", async () => {
      const { linearVoting, safe, govToken } = await baseSetup();
      expect(await linearVoting.governanceToken()).to.equal(govToken.address);
      expect(await linearVoting.votingPeriod()).to.equal(60);
      expect(await linearVoting.quorumThreshold()).to.equal(
        "2000000000000000000"
      );
      expect(await linearVoting.timeLockPeriod()).to.equal(60);
    });
  });

  describe("timelock", async () => {
    it("can update timelock period from safe", async () => {
      const { linearVoting, safe } = await baseSetup();
      expect(
        await executeContractCallWithSigners(
          safe,
          linearVoting,
          "updateTimeLockPeriod",
          [1337],
          [wallet_0]
        )
      )
        .to.emit(linearVoting, "TimeLockUpdated")
        .withArgs(60, 1337);
      expect(await linearVoting.timeLockPeriod()).to.equal(1337);
    });

    it("should revert update timelock period if not from avatar/owner", async () => {
      const { linearVoting, safe } = await baseSetup();
      await expect(linearVoting.updateTimeLockPeriod(1337)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("can update timelock period from proposal", async () => {
      const { proposalModule, safe, linearVoting, govToken } =
        await baseSetup();
      await govToken.delegate(wallet_0.address);
      const Call = buildContractCall(
        linearVoting,
        "updateTimeLockPeriod",
        [1337],
        0
      );
      const txHash = await proposalModule.getTransactionHash(
        Call.to,
        Call.value,
        Call.data,
        Call.operation,
        0
      );
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await linearVoting.vote(0, 1);
      await network.provider.send("evm_increaseTime", [60]);
      await linearVoting.finalizeVote(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        linearVoting.address, // target
        0, // value
        Call.data, // data
        0, // call operation
        0 // txHash index
      );
      expect(await linearVoting.timeLockPeriod()).to.equal(1337);
    });
  });

  describe("openzepplin linear voting module", async () => {
    it("can delegate votes to self", async () => {
      const { proposalModule, linearVoting, govToken } = await baseSetup();
      const bal = await govToken.balanceOf(wallet_0.address);
      await govToken.delegate(wallet_0.address);
      const delegatation = await govToken.getVotes(wallet_0.address);
      expect(delegatation).to.equal("49997000000000000000000");
    });

    it("can delegate votes to others", async () => {
      const {
        proposalModule,
        linearVoting,
        govToken,
        defaultBalance,
        thresholdBalance,
      } = await baseSetup();
      await govToken.connect(wallet_1).approve(linearVoting.address, 1000);
      await govToken.connect(wallet_1).delegate(wallet_0.address);
      let delegatation = await govToken.getVotes(wallet_0.address);
      expect(delegatation).to.equal(defaultBalance);
      await govToken.connect(wallet_2).approve(linearVoting.address, 1000);
      await govToken.connect(wallet_2).delegate(wallet_0.address);
      delegatation = await govToken.getVotes(wallet_0.address);
      expect(delegatation).to.equal(thresholdBalance);
    });

    it("can vote past the threshold with delegation", async () => {
      const { proposalModule, linearVoting, govToken, addCall, txHash } =
        await baseSetup();
      await govToken.delegate(wallet_0.address);
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      const proposal = await linearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(ethers.BigNumber.from(0));
      await linearVoting.vote(0, 1);
      const proposalAfterVoting = await linearVoting.proposals(0);
      expect(proposalAfterVoting.yesVotes).to.equal(
        ethers.BigNumber.from("49997000000000000000000")
      );
      expect(await linearVoting.hasVoted(0, wallet_0.address)).to.equal(true);
    });

    it("can vote only once per proposal", async () => {
      const { proposalModule, linearVoting, govToken, addCall, txHash } =
        await baseSetup();
      await govToken.delegate(wallet_0.address);
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      const proposal = await linearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(ethers.BigNumber.from(0));
      await linearVoting.vote(0, 1);
      await expect(linearVoting.vote(0, 1)).to.be.revertedWith(
        "voter has already voted"
      );
    });

    it("cannot finalize if not past threshold", async () => {
      const {
        proposalModule,
        linearVoting,
        govToken,
        addCall,
        txHash,
        defaultBalance,
      } = await baseSetup();
      await govToken.connect(wallet_2).delegate(wallet_0.address);
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await linearVoting.vote(0, 1);
      let proposal = await linearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(defaultBalance);
      await network.provider.send("evm_increaseTime", [60]);
      await expect(linearVoting.finalizeVote(0)).to.be.revertedWith(
        "a quorum has not been reached for the proposal"
      );
    });

    it("cannot finalize if not past voting deadline", async () => {
      const { proposalModule, linearVoting, govToken, addCall, txHash } =
        await baseSetup();
      await govToken.connect(wallet_2).delegate(wallet_0.address);
      await govToken.connect(wallet_1).delegate(wallet_0.address);
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await linearVoting.vote(0, 1);
      await expect(linearVoting.finalizeVote(0)).to.be.revertedWith(
        "voting period has not passed yet"
      );
    });

    // // hardhat currently will not revert when manual
    // // https://github.com/nomiclabs/hardhat/issues/1468
    // it.skip("cannot vote if delegatation is in the same block", async () => {
    // });

    it("can not vote if delegation after voting starts", async () => {
      const { proposalModule, linearVoting, govToken, txHash } =
        await baseSetup();
      let block = ethers.BigNumber.from(
        await network.provider.send("eth_blockNumber")
      );
      await network.provider.send("evm_mine");
      expect(await linearVoting.calculateWeight(wallet_2.address, 0)).to.equal(
        0
      );
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await govToken.connect(wallet_1).delegate(wallet_1.address);
      await network.provider.send("evm_mine");
      await linearVoting.connect(wallet_1).vote(0, 1);
      let proposal = await linearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(0);
    });

    it("can not vote if re-delegating votes", async () => {
      const { proposalModule, linearVoting, govToken, txHash, defaultBalance } =
        await baseSetup();
      let block = ethers.BigNumber.from(
        await network.provider.send("eth_blockNumber")
      );
      await govToken.connect(wallet_1).delegate(wallet_1.address);
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await network.provider.send("evm_mine");
      expect(await linearVoting.calculateWeight(wallet_1.address, 0)).to.equal(
        defaultBalance
      );
      await linearVoting.connect(wallet_1).vote(0, 1);
      await govToken.connect(wallet_1).delegate(wallet_3.address);
      await network.provider.send("evm_mine");
      await linearVoting.connect(wallet_3).vote(0, 1);
      let proposal = await linearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(defaultBalance);
    });

    it("can not vote in same block as proposal", async () => {
      const { proposalModule, linearVoting, govToken, txHash, defaultBalance } =
        await baseSetup();
      let block = ethers.BigNumber.from(
        await network.provider.send("eth_blockNumber")
      );
      await govToken.connect(wallet_1).delegate(wallet_1.address);
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await expect(
        linearVoting.calculateWeight(wallet_2.address, 0)
      ).to.be.revertedWith("ERC20Votes: block not yet mined");
    });

    it("can't pass proposal without more yes votes", async () => {
      const {
        proposalModule,
        safe,
        linearVoting,
        govToken,
        addCall,
        txHash,
        defaultBalance,
      } = await baseSetup();
      await govToken.connect(wallet_2).delegate(wallet_2.address);
      await govToken.connect(wallet_1).delegate(wallet_1.address);
      await network.provider.send("evm_mine");
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await linearVoting.connect(wallet_2).vote(0, 1);
      await linearVoting.connect(wallet_1).vote(0, 0);
      let proposal = await linearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(defaultBalance);
      expect(proposal.noVotes).to.equal(defaultBalance);
      await network.provider.send("evm_increaseTime", [60]);
      await expect(linearVoting.finalizeVote(0)).to.be.revertedWith(
        "the yesVotes must be strictly over the noVotes"
      );
    });

    it("abstain votes add to quorum", async () => {
      const {
        proposalModule,
        safe,
        linearVoting,
        govToken,
        addCall,
        txHash,
        defaultBalance,
      } = await baseSetup();
      await govToken.connect(wallet_2).delegate(wallet_2.address);
      await govToken.connect(wallet_1).delegate(wallet_1.address);
      await network.provider.send("evm_mine");
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await linearVoting.connect(wallet_2).vote(0, 1);
      await linearVoting.connect(wallet_1).vote(0, 2);
      let proposal = await linearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(defaultBalance);
      expect(proposal.abstainVotes).to.equal(defaultBalance);
      await network.provider.send("evm_increaseTime", [60]);
      await expect(linearVoting.finalizeVote(0));
    });

    it("can vote past the threshold with self delegatation", async () => {
      const {
        proposalModule,
        safe,
        linearVoting,
        govToken,
        addCall,
        txHash,
        defaultBalance,
        thresholdBalance,
      } = await baseSetup();
      await govToken.connect(wallet_2).delegate(wallet_2.address);
      await govToken.connect(wallet_1).delegate(wallet_1.address);
      await network.provider.send("evm_mine");
      let block = await network.provider.send("eth_blockNumber");
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await network.provider.send("evm_mine");
      expect(await linearVoting.calculateWeight(wallet_2.address, 0)).to.equal(
        defaultBalance
      );
      await linearVoting.connect(wallet_2).vote(0, 1);
      await govToken.connect(wallet_2).delegate(wallet_3.address);
      await linearVoting.connect(wallet_3).vote(0, 1);
      let proposal = await linearVoting.proposals(0);
      await linearVoting.connect(wallet_1).vote(0, 1);
      proposal = await linearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(thresholdBalance);
      await network.provider.send("evm_increaseTime", [60]);
      await linearVoting.finalizeVote(0);
      expect(await proposalModule.state(0)).to.equal(2);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      expect(await proposalModule.state(0)).to.equal(4);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        safe.address, // target
        0, // value
        addCall.data, // data
        0, // call operation
        0 // txHash index
      );
      expect(await proposalModule.state(0)).to.equal(3);
      const owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_1.address);
      expect(owners[1]).to.equal(wallet_0.address);
    });

    it("can vote on multiple proposals", async () => {
      const {
        proposalModule,
        safe,
        linearVoting,
        govToken,
        addCall,
        txHash,
        addCall_1,
        txHash_1,
      } = await baseSetup();
      await govToken.delegate(wallet_0.address);
      await govToken.connect(wallet_2).delegate(wallet_2.address);
      await govToken.connect(wallet_1).delegate(wallet_1.address);
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await proposalModule
        .connect(wallet_1)
        .submitProposal([txHash_1], linearVoting.address, "0x");
      await linearVoting.connect(wallet_1).vote(0, 1);
      await linearVoting.connect(wallet_1).vote(1, 1);
      await linearVoting.connect(wallet_2).vote(0, 1);
      await linearVoting.connect(wallet_2).vote(1, 1);
      await network.provider.send("evm_increaseTime", [60]);
      await linearVoting.finalizeVote(0);
      await linearVoting.finalizeVote(1);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        safe.address, // target
        0, // value
        addCall.data, // data
        0, // call operation
        0 // txHash index
      );
      await proposalModule.executeProposalByIndex(
        1, // proposalId
        safe.address, // target
        0, // value
        addCall_1.data, // data
        0, // call operation
        0 // txHash index
      );
      const owners = await safe.getOwners();
      expect(owners[0]).to.equal(wallet_2.address);
      expect(owners[1]).to.equal(wallet_1.address);
      expect(owners[2]).to.equal(wallet_0.address);
    });

    it("can complete a funding proposals", async () => {
      const { proposalModule, govToken, linearVoting, safe } =
        await baseSetup();
      await govToken.delegate(wallet_0.address);
      let transferCall = buildContractCall(
        govToken,
        "transfer",
        [wallet_2.address, 1000],
        await safe.nonce()
      );
      const txHash = await proposalModule.getTransactionHash(
        transferCall.to,
        transferCall.value,
        transferCall.data,
        transferCall.operation,
        0
      );
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await linearVoting.vote(0, 1);
      let proposal = await proposalModule.proposals(0);
      await network.provider.send("evm_increaseTime", [60]);
      await linearVoting.finalizeVote(0);
      await network.provider.send("evm_increaseTime", [60]);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        govToken.address, // target
        0, // value
        transferCall.data, // data
        0, // call operation
        0 // txHash index
      );
      expect(await govToken.balanceOf(wallet_2.address)).to.equal(
        ethers.BigNumber.from("1000000000000001000")
      );
    });

    it("can vote with ERC712 offchain signature", async () => {
      const {
        proposalModule,
        linearVoting,
        safe,
        govToken,
        txHash,
        addCall,
        defaultBalance,
      } = await baseSetup();
      const wallet = Wallet.generate();
      await govToken.connect(wallet_2).delegate(wallet.getAddressString());
      let block = ethers.BigNumber.from(
        await network.provider.send("eth_blockNumber")
      );
      const delegatation = await govToken.getVotes(wallet.getAddressString());
      expect(delegatation).to.equal(defaultBalance);
      await proposalModule.submitProposal([txHash], linearVoting.address, "0x");
      await network.provider.send("evm_mine");
      expect(
        await linearVoting.calculateWeight(wallet.getAddressString(), 0)
      ).to.equal(defaultBalance);
      const name = "Test";
      const version = "1";
      const verifyingContract = linearVoting.address;
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
      await linearVoting.voteSignature(0, 1, signature);
      expect(
        await linearVoting.hasVoted(0, wallet.getAddressString())
      ).to.equal(true);
      let proposal = await linearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal(defaultBalance);
    });
  });

  describe("Membership OZ linearVoting", async () => {
    it("can not add member non-owner", async () => {
      const { memberLinearVoting } =
        await baseSetup();
        await expect(memberLinearVoting.addMember(wallet_2.address)).to.be.revertedWith("Ownable: caller is not the owner")
    });

    it("can not remove member non-owner", async () => {
      const { memberLinearVoting } =
        await baseSetup();
        await expect(memberLinearVoting.removeMember(wallet_2.address)).to.be.revertedWith("Ownable: caller is not the owner")
    });

    it("can add member through admin", async () => {
      const {
        safe,
        memberLinearVoting,
      } = await baseSetup();
      await executeContractCallWithSigners(
        safe,
        memberLinearVoting,
        "addMember",
        [wallet_0.address],
        [wallet_0]
      );
      const member = await memberLinearVoting.members(wallet_0.address);
      expect(member).to.equal(true);
    });

    it("can add member through proposal", async () => {
      const {
        proposalModule,
        safe,
        memberLinearVoting,
        govToken,
        defaultBalance,
        thresholdBalance,
      } = await baseSetup();
      await executeContractCallWithSigners(
        safe,
        memberLinearVoting,
        "addMember",
        [wallet_0.address],
        [wallet_0]
      );
      const addMemberCall = buildContractCall(
        memberLinearVoting,
        "addMember",
        [wallet_1.address],
        0
      );
      const txHash = await proposalModule.getTransactionHash(
        addMemberCall.to,
        addMemberCall.value,
        addMemberCall.data,
        addMemberCall.operation,
        0
      );
      await govToken.delegate(wallet_0.address);
      await network.provider.send("evm_mine");
      await proposalModule.submitProposal([txHash], memberLinearVoting.address, "0x");
      await network.provider.send("evm_mine");
      await memberLinearVoting.vote(0, 1);
      let proposal = await memberLinearVoting.proposals(0);
      expect(proposal.yesVotes).to.equal('49997000000000000000000');
      await network.provider.send("evm_increaseTime", [60]);
      await memberLinearVoting.finalizeVote(0);
      expect(await proposalModule.state(0)).to.equal(2);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      expect(await proposalModule.state(0)).to.equal(4);
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        memberLinearVoting.address, // target
        0, // value
        addMemberCall.data, // data
        0, // call operation
        0 // txHash index
      );
      const member = await memberLinearVoting.members(wallet_1.address);
      expect(member).to.equal(true);
      expect(await memberLinearVoting.memberCount()).to.equal(2)
    });

    it("can remove member through admin", async () => {
      const {
        safe,
        memberLinearVoting,
      } = await baseSetup();
      await executeContractCallWithSigners(
        safe,
        memberLinearVoting,
        "addMember",
        [wallet_0.address],
        [wallet_0]
      );
      let member = await memberLinearVoting.members(wallet_0.address);
      expect(member).to.equal(true);
      expect(await memberLinearVoting.memberCount()).to.equal(1)
      await executeContractCallWithSigners(
        safe,
        memberLinearVoting,
        "removeMember",
        [wallet_0.address],
        [wallet_0]
      );
      member = await memberLinearVoting.members(wallet_0.address);
      expect(member).to.equal(false);
      expect(await memberLinearVoting.memberCount()).to.equal(0)
    });

    it("can remove member through proposal", async () => {
      const {
        proposalModule,
        safe,
        memberLinearVoting,
        govToken,
        defaultBalance,
        thresholdBalance,
      } = await baseSetup();
      await executeContractCallWithSigners(
        safe,
        memberLinearVoting,
        "addMember",
        [wallet_0.address],
        [wallet_0]
      );
      const removeMemberCall = buildContractCall(
        memberLinearVoting,
        "removeMember",
        [wallet_0.address],
        0
      );
      const txHash = await proposalModule.getTransactionHash(
        removeMemberCall.to,
        removeMemberCall.value,
        removeMemberCall.data,
        removeMemberCall.operation,
        0
      );
      await govToken.delegate(wallet_0.address);
      await network.provider.send("evm_mine");
      await proposalModule.submitProposal([txHash], memberLinearVoting.address, "0x");
      await network.provider.send("evm_mine");
      await memberLinearVoting.vote(0, 1);
      await network.provider.send("evm_increaseTime", [60]);
      await memberLinearVoting.finalizeVote(0);
      await network.provider.send("evm_increaseTime", [60]);
      await network.provider.send("evm_mine");
      await proposalModule.executeProposalByIndex(
        0, // proposalId
        memberLinearVoting.address, // target
        0, // value
        removeMemberCall.data, // data
        0, // call operation
        0 // txHash index
      );
      const member = await memberLinearVoting.members(wallet_0.address);
      expect(member).to.equal(false);
      expect(await memberLinearVoting.memberCount()).to.equal(0)
    });
  })
});
