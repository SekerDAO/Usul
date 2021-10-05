import "@nomiclabs/hardhat-waffle";
import "@openzeppelin/hardhat-upgrades";
import "solidity-coverage";
import "hardhat-deploy";
import "hardhat-gas-reporter"
//import "@nomiclabs/hardhat-ethers";
/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
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
  gasReporter: {
    enabled: true
  }
};
