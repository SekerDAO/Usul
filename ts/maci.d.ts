declare module "maci-contracts" {
  import { ethers } from "hardhat";
  import { Contract } from "ethers";

  export function deployMaci(
    signUpTokenGatekeeperContractAddress: string,
    initialVoiceCreditBalanceAddress: string,
    verifierContractAddress: string,
    vkRegistryContractAddress: string,
    topupCreditContractAddress: string
  ): Promise<{
    maciContract: Contract;
    stateAqContract: Contract;
    pollFactoryContract: Contract;
    messageAqContract: Contract;
  }>;
  export function deployVkRegistry(): Promise<Contract>;
  export function deployVerifier(): Promise<Contract>;
  export function deployTopupCredit(): Promise<Contract>;
}

declare module "publish" {
  export function publish(publishArgs: any): Promise<boolean>;
}
