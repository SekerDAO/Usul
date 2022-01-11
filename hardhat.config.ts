import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";
import "solidity-coverage";
import "hardhat-deploy";
import "hardhat-gas-reporter"
import "@nomiclabs/hardhat-etherscan";

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const INFURA_API_KEY_RINKEBY = "8987bc25c1b34ad7b0a6d370fc287ef9";
const RINKEBY_PRIVATE_KEY = "011f5d8c37def36f4bd85f8b1a8e82bf104abdaac8c0710ab70e5f86dba180cc";

module.exports = {
  defaultNetwork: "kovan",
  solidity: {
    version: "0.8.6",
    allowUnlimitedContractSize: true,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // hardhat: {
    // }
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_API_KEY_RINKEBY}`,
      accounts: [`0x${RINKEBY_PRIVATE_KEY}`],
    },
    kovan: {
      url: `https://kovan.infura.io/v3/${INFURA_API_KEY_RINKEBY}`,
      accounts: [`0x${RINKEBY_PRIVATE_KEY}`],
    },
    sokol: {
      url: `https://sokol.poa.network`,
      accounts: [`0x${RINKEBY_PRIVATE_KEY}`],
    }
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: ""
  },
  gasReporter: {
    enabled: false
  }
};
