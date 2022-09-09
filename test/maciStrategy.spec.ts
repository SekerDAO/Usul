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

    // silence logs to suppress output from MACI deploy scripts.
    const original = console.log;
    console.log = () => {};

    // deploy MACI
    const vkRegistry = await deployVkRegistry();
    const verifierContract = await deployVerifier();
    const maci = await deployMaci(
      maciVoting.address,
      maciVoting.address,
      verifierContract.address,
      vkRegistry.address,
      maciVoting.address
    );

    // restore logs
    console.log = original;

    // set maci on maciVoting
    const setMACI = buildContractCall(
      maciVoting,
      "setMACI",
      [maci.maciContract.address],
      await safe.nonce()
    );

    const setMaciTxHash = await proposalModule.getTransactionHash(
      setMACI.to,
      setMACI.value,
      setMACI.data,
      setMACI.operation
    );

    await executeContractCallWithSigners(
      safe,
      maciVoting,
      "setMACI",
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

  describe("SetUp()", async () => {
    it("constructor and setUp() functions succeed", async () => {
      const { maciVoting, maci } = await baseSetup();
      expect(await maciVoting.MACI()).to.equal(maci.maciContract.address);
    });

    it("correctly initializes variables", async () => {
      const { maciVoting, maci, safe } = await baseSetup();
      expect(await maciVoting.owner()).to.equal(safe.address);
      expect(await maciVoting.coordinator()).to.equal(coordinator.address);
      expect(await maciVoting.MACI()).to.equal(maci.maciContract.address);
      expect((await maciVoting.coordinatorPubKey()).toString()).to.equal(
        coodinatorKeyPair.pubKey.asArray().toString()
      );
      expect(await maciVoting.duration()).to.equal(duration);
      expect(await maciVoting.timeLockPeriod()).to.equal(timeLockPeriod);
    });
  });

  describe("SetMACI()", async () => {
    it("reverts if called by an account that is not owner");
    it("reverts if _MACI is zero address");
    it("sets MACI address");
    it("emits MACISet event with correct return values");
  });

  describe("SetCoordinator()", async () => {
    it("reverts if called by an account that is not owner");
    it("reverts if _coordinator is zero address");
    it("sets coordinator address");
    it("sets coordinatorPubKey");
    it("emits CoordinatorSet event with correct return values");
  });

  describe("SetDuration()", async () => {
    it("reverts if called by an account that is not owner");
    it("reverts if _duration is zero address");
    it("sets duration");
    it("emits DurationSet event with correct return values");
  });

  describe("SetTimeLockPeriod()", async () => {
    it("reverts if called by an account that is not owner");
    it("sets timeLockPeriod");
    it("emits TimeLockPeriodSet event with correct return values");
  });

  describe("SetMaxValuesAndTreeDepths()", async () => {
    it("reverts if called by an account that is not owner");
    it("reverts if treeDepths are invalid");
    it("sets BatchSizes");
    it("sets TreeDepths");
    it("emits MaxValuesAndTreeDepthsSet event with correct return values");
  });

  describe("SetDuration()", async () => {
    it("returns false if proposal has not passed");
    it("returns true if proposal has passed");
  });

  describe("Register()", async () => {
    it("reverts if called by an account that is not MACI");
    it("reverts if provided member is not a member");
    it("reverts if member is already registered");
    it("emits MemberRegistered event with correct return values");
  });

  describe("getVoiceCredits()", async () => {
    it("returns correct number of voice credits");
  });

  describe("checkPoll()", async () => {
    it("returns true if a given poll exists on the MACI contract");
    it("returns false if a given poll does not exist on the MACI contract");
  });

  describe("checkPoll()", async () => {
    it("reverts if called by an account that is not usul");
    it("reverts if pollId already exists");
    it("reverts if pollId is not the next pollId");
    it("deploys a new poll");
    it("maps the Usul poll ID to the maci poll address");
    it("emits ProposalReceived with correct return values");
  });

  describe("finalizeProposal()", async () => {
    it("reverts if proposal is already finalized");
    it("reverts if proposal is cancelled");
    it("reverts if voting is still in progress");
    it("reverts if tallying is not yet complete");
    it("reverts if tallyHash is not yet published");
    it("reverts if total spent is incorrect");
    it("reverts if spent length or spent proof arrays lengths are not 2");
    it("reverts if incorrect spent voice credits are provided");
    it("sets proposal.passed to true if yes votes are greater than no votes");
    it("sets proposal.finalized to true");
    it("calls finalizeStrategy() with correct proposalId");
  });

  describe("finalizeProposal()", async () => {
    it("reverts if proposal has not passed");
    it("calls reveiveProposal() on usul if proposal has passed");
    it("emits VoteFinalized with correct return values");
  });
});
