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
  export function deployVkRegistry(): Promise<any>;
  export function deployVerifier(): Promise<any>;
  export function deployTopupCredit(): Primise<any>;
}
