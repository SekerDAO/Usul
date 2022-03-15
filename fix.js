var ethers = require('ethers');  
var url = 'https://kovan.infura.io/v3/292c366623594a44a3d5e76a68d1d9d2';
var customHttpProvider = new ethers.providers.JsonRpcProvider(url);
var privateKey = "0x011f5d8c37def36f4bd85f8b1a8e82bf104abdaac8c0710ab70e5f86dba180cc";
var wallet = new ethers.Wallet(privateKey);
console.log("Address: " + wallet.address);
tx = {
  to: "0x6E0d01A76C3Cf4288372a29124A26D4353EE51BE",
  value: ethers.utils.parseEther("0.05"),
  chainId: 42,
  nonce: 0
}
customHttpProvider.estimateGas(tx).then(function(estimate) {
    tx.gasLimit = estimate;
    tx.gasPrice = ethers.utils.parseUnits("0.14085197", "gwei");
    wallet.signTransaction(tx).then((signedTX)=>{
	customHttpProvider.sendTransaction(signedTX).then(console.log);
    });
});