declare module "maci-contracts" {
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
  export function deployTopupCredit(): Primise<Contract>;
}
