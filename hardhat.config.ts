import "@nomiclabs/hardhat-waffle";
import "@openzeppelin/hardhat-upgrades";
import "solidity-coverage";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-etherscan";
import dotenv from "dotenv";

dotenv.config();

//import "@nomiclabs/hardhat-ethers";
/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const INFURA_API_KEY = "";
const RINKEBY_PRIVATE_KEY = "";

module.exports = {
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [
      {
        version: "0.8.6",
        allowUnlimitedContractSize: true,
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {},
    ganache: {
      url: `HTTP://192.168.1.10:8545`,
      accounts: [
        `0x599e7e8fd6192c058e5a64ef2b33d3f4f9ff374f5bcfaeadf3505a0f477a1761`,
      ],
    },
    // rinkeby: {
    //   url: `https://rinkeby.infura.io/v3/${INFURA_API_KEY}`,
    //   accounts: [`0x${RINKEBY_PRIVATE_KEY}`],
    // }
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: "",
  },
  gasReporter: {
    enabled: false,
  },
  external: {
    contracts: [
      {
        artifacts: "node_modules/maci-contracts/artifacts",
        deploy: "node_modules/ts/index",
      },
    ],
  },
  mocha: {
    timeout: 100000000
  },
};
