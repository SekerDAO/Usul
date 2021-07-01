require("@nomiclabs/hardhat-waffle");
import '@openzeppelin/hardhat-upgrades';
/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.0",
    allowUnlimitedContractSize: true,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  }
};
