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
import { ecsign, zeroAddress } from "ethereumjs-util";
import Wallet from "ethereumjs-wallet";
import {
  deployMaci,
  deployVkRegistry,
  deployVerifier,
  deployTopupCredit,
  publish
} from "maci-contracts";
import { Keypair, PubKey } from "maci-domainobjs";

const deadline =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

const provider = waffle.provider;

describe("Maci Strategy:", () => {
  const [owner, coordinator, user_1, user_2] = waffle.provider.getWallets();
  const chainId = ethers.BigNumber.from(network.config.chainId).toNumber();

  const coodinatorKeyPair = new Keypair();
  const duration = 300; // seconds
  const timeLockPeriod = 300; // seconds
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
    const duration = 300;
    const timeLockPeriod = 300;
    const MaciVotingMasterCopy = await MaciVotingContract.deploy(
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000001",
      coodinatorKeyPair.pubKey.asContractParam(),
      duration,
      timeLockPeriod,
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

    const dummyTallyData = {
      totalSpent: 0,
      totalSpentSalt: 0,
      spent: [0, 0],
      spentProof: [
        [
          [0, 0],
          [0, 0],
        ],
        [
          [0, 0],
          [0, 0],
        ],
      ],
      spentSalt: 0,
      hash: "0x0000000000000000000000000000000000000000000000000000000000000001",
    };

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
      dummyTallyData,
      duration,
      timeLockPeriod,
    };
  });

  describe("setUp()", async () => {
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

  describe("setMACI()", async () => {
    it("reverts if called by an account that is not owner", async () => {
      const { maciVoting, safe } = await baseSetup();
      await expect(maciVoting.setMACI(owner.address)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
    it("reverts if _MACI is zero address", async () => {
      const { maciVoting, safe } = await baseSetup();
      // transfer ownership to EOA to avoid safe gas estimation errors.
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "transferOwnership",
          [owner.address],
          [owner]
        )
      );
      await expect(maciVoting.setMACI(AddressZero)).to.be.revertedWith(
        "MACIAddressCannotBeZero()"
      );
    });
    it("sets MACI address", async () => {
      const { maciVoting, safe } = await baseSetup();
      expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "setMACI",
          [owner.address],
          [owner]
        )
      );
      expect(await maciVoting.MACI()).to.equal(owner.address);
    });
    it("emits MACISet event with correct return values", async () => {
      const { maciVoting, safe } = await baseSetup();
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "setMACI",
          [owner.address],
          [owner]
        )
      )
        .to.emit(maciVoting, "MACISet")
        .withArgs(owner.address);
    });
  });

  describe("setCoordinator()", async () => {
    it("reverts if called by an account that is not owner", async () => {
      const { maciVoting } = await baseSetup();
      const keypair = new Keypair();
      await expect(
        maciVoting.setCoordinator(
          user_1.address,
          keypair.pubKey.asContractParam()
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("reverts if _coordinator is zero address", async () => {
      const { maciVoting, safe } = await baseSetup();
      const keypair = new Keypair();
      await executeContractCallWithSigners(
        safe,
        maciVoting,
        "transferOwnership",
        [owner.address],
        [owner]
      );
      await expect(
        maciVoting.setCoordinator(
          zeroAddress(),
          keypair.pubKey.asContractParam()
        )
      ).to.be.revertedWith("CoordinatorAddressCannotBeZero()");
    });
    it("sets coordinator address", async () => {
      const { maciVoting, safe } = await baseSetup();
      const keypair = new Keypair();
      await executeContractCallWithSigners(
        safe,
        maciVoting,
        "transferOwnership",
        [owner.address],
        [owner]
      );
      await expect(
        maciVoting.setCoordinator(
          user_1.address,
          keypair.pubKey.asContractParam()
        )
      );
      await expect(await maciVoting.coordinator()).to.equal(user_1.address);
    });
    it("sets coordinatorPubKey", async () => {
      const { maciVoting, safe } = await baseSetup();
      const keypair = new Keypair();
      await executeContractCallWithSigners(
        safe,
        maciVoting,
        "transferOwnership",
        [owner.address],
        [owner]
      );
      await expect(
        maciVoting.setCoordinator(
          user_1.address,
          keypair.pubKey.asContractParam()
        )
      );
      let expectedPubKey = keypair.pubKey.asContractParam();
      await expect((await maciVoting.coordinatorPubKey()).toString()).to.equal(
        [expectedPubKey.x, expectedPubKey.y].toString()
      );
    });
    it("emits CoordinatorSet event with correct return values", async () => {
      const { maciVoting, safe } = await baseSetup();
      const keypair = new Keypair();
      await executeContractCallWithSigners(
        safe,
        maciVoting,
        "transferOwnership",
        [owner.address],
        [owner]
      );
      let expectedPubKey = keypair.pubKey.asContractParam();
      await expect(
        maciVoting.setCoordinator(
          user_1.address,
          keypair.pubKey.asContractParam()
        )
      )
        .to.emit(maciVoting, "CoordinatorSet")
        .withArgs(user_1.address, [expectedPubKey.x, expectedPubKey.y]);
    });
  });

  describe("setDuration()", async () => {
    it("reverts if called by an account that is not owner");
    it("reverts if _duration is zero address");
    it("sets duration");
    it("emits DurationSet event with correct return values");
  });

  describe("setTimeLockPeriod()", async () => {
    it("reverts if called by an account that is not owner");
    it("sets timeLockPeriod");
    it("emits TimeLockPeriodSet event with correct return values");
  });

  describe("setMaxValuesAndTreeDepths()", async () => {
    it("reverts if called by an account that is not owner");
    it("reverts if treeDepths are invalid");
    it("sets BatchSizes");
    it("sets TreeDepths");
    it("emits MaxValuesAndTreeDepthsSet event with correct return values");
  });

  describe("setDuration()", async () => {
    it("returns false if proposal has not passed");
    it("returns true if proposal has passed");
  });

  describe("register()", async () => {
    it("reverts if called by an account that is not MACI", async () => {
      const { maciVoting, safe } = await baseSetup();
      await expect(maciVoting.register(owner.address, "0x")).to.be.revertedWith(
        `NotMACI("${owner.address}")`
      );
    });
    it("reverts if provided member is not a member", async () => {
      const { maciVoting, safe } = await baseSetup();
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "setMACI",
          [owner.address],
          [owner]
        )
      );
      await expect(
        maciVoting.register(user_1.address, "0x")
      ).to.be.revertedWith(`NotMember("${user_1.address}")`);
    });
    it("reverts if member is already registered", async () => {
      const { maciVoting, safe } = await baseSetup();
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "setMACI",
          [owner.address],
          [owner]
        )
      );
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "addMember",
          [user_1.address],
          [owner]
        )
      );
      await expect(maciVoting.register(user_1.address, "0x"));
      await expect(
        maciVoting.register(user_1.address, "0x")
      ).to.be.revertedWith(`AlreadyRegistered("${user_1.address}")`);
    });
    it("registers a user", async () => {
      const { maciVoting, safe } = await baseSetup();
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "setMACI",
          [owner.address],
          [owner]
        )
      );
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "addMember",
          [user_1.address],
          [owner]
        )
      );
      await expect(maciVoting.register(user_1.address, "0x"));
      await expect(await maciVoting.registered(user_1.address)).to.equal(true);
    });
    it("emits MemberRegistered event with correct return values", async () => {
      const { maciVoting, safe } = await baseSetup();
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "setMACI",
          [owner.address],
          [owner]
        )
      );
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "addMember",
          [user_1.address],
          [owner]
        )
      );
      await expect(maciVoting.register(user_1.address, "0x"))
        .to.emit(maciVoting, "MemberRegistered")
        .withArgs(user_1.address);
    });
  });

  describe("getVoiceCredits()", async () => {
    it("returns correct number of voice credits", async () => {
      const { maciVoting, safe } = await baseSetup();
      await expect(
        await maciVoting.getVoiceCredits(user_1.address, "0x")
      ).to.equal(1);
    });
  });

  describe("checkPoll()", async () => {
    it("returns true if a given poll exists on the MACI contract", async () => {
      const { maciVoting, safe } = await baseSetup();
      const data = await ethers.utils.defaultAbiCoder.encode(
        ["uint256", "bytes32[]", "uint256"],
        ["0", [], "0"]
      );
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "setUsul",
          [owner.address],
          [owner]
        )
      );
      await maciVoting.receiveProposal(data);
      await expect(await maciVoting.checkPoll(0)).to.equal(true);
    });
    it("returns false if a given poll does not exist on the MACI contract", async () => {
      const { maciVoting } = await baseSetup();
      await expect(await maciVoting.checkPoll(0)).to.equal(false);
    });
  });

  describe("receiveProposal()", async () => {
    it("reverts if called by an account that is not Usul", async () => {
      const { maciVoting } = await baseSetup();
      await expect(maciVoting.receiveProposal("0x")).to.be.revertedWith(
        "only Usul module may enter"
      );
    });
    it("reverts if pollId already exists", async () => {
      const { maciVoting, safe } = await baseSetup();
      const data = await ethers.utils.defaultAbiCoder.encode(
        ["uint256", "bytes32[]", "uint256"],
        ["0", [], "0"]
      );
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "setUsul",
          [owner.address],
          [owner]
        )
      );
      await expect(await maciVoting.receiveProposal(data));
      await expect(maciVoting.receiveProposal(data)).to.be.revertedWith(
        "PollIdAlreadyExists()"
      );
    });
    it("reverts if pollId is not the next pollId", async () => {
      const { maciVoting, proposalModule, txHash } = await baseSetup();
      const pollId = await ethers.utils.defaultAbiCoder.encode(
        ["uint256"],
        [0]
      );
      const data = await ethers.utils.defaultAbiCoder.encode(
        ["bytes"],
        [pollId]
      );
      await expect(
        proposalModule.submitProposal([txHash], maciVoting.address, data)
      ).to.be.revertedWith("PollIdIsNotNext()");
    });
    it("deploys a new poll", async () => {
      const { maciVoting, safe } = await baseSetup();
      const data = await ethers.utils.defaultAbiCoder.encode(
        ["uint256", "bytes32[]", "uint256"],
        ["0", [], "0"]
      );
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "setUsul",
          [owner.address],
          [owner]
        )
      );
      await expect(maciVoting.receiveProposal(data));
    });

    it.only("cast a vote", async () => {
      const { maciVoting, safe, maci } = await baseSetup();
      const data = await ethers.utils.defaultAbiCoder.encode(
        ["uint256", "bytes32[]", "uint256"],
        ["0", [], "0"]
      );
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "setUsul",
          [owner.address],
          [owner]
        )
      );
      await expect(maciVoting.receiveProposal(data));
      const proposal = await maciVoting.proposals(0);
      const PollContract = await ethers.getContractAt("Poll", proposal.poll);
      const voterKeyPair = new Keypair();
      const voterPubKey = voterKeyPair.pubKey.serialize();
      const voterPrivKey = voterKeyPair.privKey.serialize()
      console.log(voterPrivKey)
      //console.log(maci)
      let signups = await maci.maciContract.numSignUps()
      console.log(signups)
      //await maci.maciContract.signUp(voterPubKey, "0x", "0x");

      let tx
      try {
          tx = await maci.maciContract.signUp(
              voterPubKey,
              "0x",
              "0x",
              { gasLimit: 1000000 }
          )

      } catch(e) {
          console.error('Error: the transaction failed')
          if (e.message) {
              console.error(e.message)
          }
          return
      }
      //console.log(tx)
      const receipt = await tx.wait()
      const iface = maci.maciContract.interface
      console.log('Transaction hash:', tx.hash)
      console.log(receipt.logs[0])
      //console.log(iface)
      // get state index from the event
      let stateIndex;
      if (receipt && receipt.logs) {
          const sIndex = receipt.logs[0].data
          stateIndex = BigInt(sIndex)
          console.log('State index:', stateIndex.toString())
      } else {
          console.error('Error: unable to retrieve the transaction receipt')
      }

      // todo get state index from event
      signups = await maci.maciContract.numSignUps()
      console.log(signups)

      const voteOptionIndex = -1;
      const newVoteWeight = 1;
      const nonce = 1;
      const pollId = "0";
      const salt = "0";

      const pubMessage = await publish(
        voterPubKey,
        PollContract.address,
        voterPrivKey,
        stateIndex,
        voteOptionIndex,
        newVoteWeight,
        nonce,
        salt,
        pollId,
      )

      // const command:PCommand = new PCommand(
      //     stateIndex,
      //     voterPubKey,
      //     voteOptionIndex,
      //     newVoteWeight,
      //     nonce,
      //     pollId,
      //     salt,
      // )
      // const signature = command.sign(userMaciPrivkey)
      // const message = command.encrypt(
      //     signature,
      //     Keypair.genEcdhSharedKey(
      //         encKeypair.privKey,
      //         coordinatorPubKey,
      //     )
      // )

    });

    it("maps the Usul poll ID to the maci poll address", async () => {
      const { maci, maciVoting, safe } = await baseSetup();
      const data = await ethers.utils.defaultAbiCoder.encode(
        ["uint256", "bytes32[]", "uint256"],
        ["0", [], "0"]
      );
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "setUsul",
          [owner.address],
          [owner]
        )
      );
      await expect(maciVoting.receiveProposal(data));
      expect(await maci.maciContract.getPoll(0)).to.equal(
        (await maciVoting.proposals(0)).poll
      );
    });
    it("emits ProposalReceived with correct return values", async () => {
      const { maci, maciVoting, safe } = await baseSetup();
      const data = await ethers.utils.defaultAbiCoder.encode(
        ["uint256", "bytes32[]", "uint256"],
        ["0", [], "0"]
      );
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "setUsul",
          [owner.address],
          [owner]
        )
      );
      const tx = await maciVoting.receiveProposal(data);
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestampBefore = blockBefore.timestamp;
      await expect(tx)
        .to.emit(maciVoting, "ProposalReceived")
        .withArgs(0, timestampBefore);
    });
  });

  describe("finalizeProposal()", async () => {
    it("reverts if proposal is already finalized");
    it("reverts if proposal is cancelled", async () => {
      const { dummyTallyData, maciVoting, safe, proposalModule, txHash } =
        await baseSetup();
      const proposalId = 0;
      await proposalModule.submitProposal(
        [txHash],
        maciVoting.address,
        proposalId
      );
      await expect(
        await executeContractCallWithSigners(
          safe,
          maciVoting,
          "cancelProposal",
          [proposalId],
          [owner]
        )
      );
      const prop = await maciVoting.proposals(proposalId);
      await expect(prop.cancelled).to.equal(true);
      await expect(
        maciVoting.finalizeProposal(
          proposalId,
          dummyTallyData.totalSpent,
          dummyTallyData.totalSpentSalt,
          dummyTallyData.spent,
          dummyTallyData.spentProof,
          dummyTallyData.spentSalt
        )
      ).to.be.revertedWith("ProposalHasBeenCancelled()");
    });
    it("reverts if voting is still in progress", async () => {
      const { dummyTallyData, maciVoting, proposalModule, txHash } =
        await baseSetup();
      const proposalId = 0;
      await proposalModule.submitProposal(
        [txHash],
        maciVoting.address,
        proposalId
      );
      await expect(
        maciVoting.finalizeProposal(
          proposalId,
          dummyTallyData.totalSpent,
          dummyTallyData.totalSpentSalt,
          dummyTallyData.spent,
          dummyTallyData.spentProof,
          dummyTallyData.spentSalt
        )
      ).to.be.revertedWith("VotingInProgress()");
    });
    it(
      "reverts if tallying is not yet complete"
      // TODO - fix test once you've figured out how to add this check to the contract
      // , async () => {
      //   const { dummyTallyData, maciVoting, proposalModule, txHash, duration } =
      //     await baseSetup();
      //   const proposalId = 0;
      //   await proposalModule.submitProposal(
      //     [txHash],
      //     maciVoting.address,
      //     proposalId
      //   );

      //   await provider.send("evm_increaseTime", [duration + 1]);

      //   const proposal = await maciVoting.proposals(proposalId);
      //   const poll = await ethers.getContractAt("Poll", proposal.poll);
      //   const [, tallyBatchSize] = await poll.batchSizes();
      //   console.log("tallyBatchSize:", tallyBatchSize);
      //   const tallyBatchNum = await poll.tallyBatchNum();
      //   console.log("tallyBatchNum:", tallyBatchNum);
      //   const numSignUpsAndMessages = await poll.numSignUpsAndMessages();
      //   console.log("numSignUpsAndMessages:", numSignUpsAndMessages);

      //   await expect(
      //     maciVoting.finalizeProposal(
      //       proposalId,
      //       dummyTallyData.totalSpent,
      //       dummyTallyData.totalSpentSalt,
      //       dummyTallyData.spent,
      //       dummyTallyData.spentProof,
      //       dummyTallyData.spentSalt
      //     )
      //   ).to.be.revertedWith("TallyingIncomplete()");
      // }
    );
    it("reverts if tallyHash is not yet published", async () => {
      const { dummyTallyData, maciVoting, proposalModule, txHash, duration } =
        await baseSetup();
      const proposalId = 0;
      await proposalModule.submitProposal(
        [txHash],
        maciVoting.address,
        proposalId
      );

      await provider.send("evm_increaseTime", [duration + 1]);

      await expect(
        maciVoting.finalizeProposal(
          proposalId,
          dummyTallyData.totalSpent,
          dummyTallyData.totalSpentSalt,
          dummyTallyData.spent,
          dummyTallyData.spentProof,
          dummyTallyData.spentSalt
        )
      ).to.be.revertedWith("TallyHashNotPublished()");
    });
    it("reverts if total spent is incorrect", async () => {
      const { dummyTallyData, maciVoting, proposalModule, txHash, duration } =
        await baseSetup();
      const proposalId = 0;
      await proposalModule.submitProposal(
        [txHash],
        maciVoting.address,
        proposalId
      );

      await provider.send("evm_increaseTime", [duration + 1]);

      await maciVoting
        .connect(coordinator)
        .publishTallyHash(0, dummyTallyData.hash);

      await expect(
        maciVoting.finalizeProposal(
          proposalId,
          dummyTallyData.totalSpent,
          dummyTallyData.totalSpentSalt,
          dummyTallyData.spent,
          dummyTallyData.spentProof,
          dummyTallyData.spentSalt
        )
      ).to.be.revertedWith("IncorrectTotalSpent()");
    });
    it("reverts if spent length or spent proof arrays lengths are not 2");
    it("reverts if incorrect spent voice credits are provided");
    it("sets proposal.passed to true if yes votes are greater than no votes");
    it("sets proposal.finalized to true");
    it("calls finalizeStrategy() with correct proposalId");
  });

  describe("finalizeStrategy()", async () => {
    it("reverts if proposal has not passed");
    it("calls reveiveProposal() on usul if proposal has passed");
    it("emits VoteFinalized with correct return values");
  });
});
