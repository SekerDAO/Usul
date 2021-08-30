// Based on https://github.com/ethereum/EIPs/blob/master/assets/eip-712/Example.js
const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
import { ethers } from "hardhat";

// Recursively finds all the dependencies of a type
const dependencies = (primaryType: string, found: any[], types: any): string[] => {
  if (found.includes(primaryType)) {
    return found;
  }
  if (types[primaryType] === undefined) {
    return found;
  }
  found.push(primaryType);
  for (let field of types[primaryType]) {
    for (let dep of dependencies(field.type, found, {})) {
      if (!found.includes(dep)) {
        found.push(dep);
      }
    }
  }
  return found;
}

const encodeType = (primaryType: string, types: any): string => {
  // Get dependencies primary first, then alphabetical
  let deps = dependencies(primaryType, [], {});
  deps = deps.filter(t => t != primaryType);
  deps = [primaryType].concat(deps.sort());

  // Format as a string with fields
  let result = '';
  for (let type of deps) {
    if (!types[type])
      throw new Error(`Type '${type}' not defined in types (${JSON.stringify(types)})`);
    result += `${type}(${types[type].map(({ name, type }: any) => `${type} ${name}`).join(',')})`;
  }
  return result;
}

const typeHash = (primaryType: string, types: any): string => {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(encodeType(primaryType, types)));
}

const encodeData = (primaryType: string, data: any, types: any): string => {
  let encTypes = [];
  let encValues = [];

  // Add typehash
  encTypes.push('bytes32');
  encValues.push(typeHash(primaryType, types));

  // Add field contents
  for (let field of types[primaryType]) {
    let value = data[field.name];
    if (field.type == 'string' || field.type == 'bytes') {
      encTypes.push('bytes32');
      value = ethers.utils.arrayify(ethers.utils.keccak256(value));
      encValues.push(value);
    } else if (types[field.type] !== undefined) {
      encTypes.push('bytes32');
      value = ethers.utils.arrayify(ethers.utils.keccak256(encodeData(field.type, value, types)));
      encValues.push(value);
    } else if (field.type.lastIndexOf(']') === field.type.length - 1) {
      throw 'TODO: Arrays currently unimplemented in encodeData';
    } else {
      encTypes.push(field.type);
      encValues.push(value);
    }
  }

  return abi.rawEncode(encTypes, encValues);
}

const domainSeparator = (domain: any): string => {
  const types = {
    EIP712Domain: [
      {name: 'name', type: 'string'},
      {name: 'version', type: 'string'},
      {name: 'chainId', type: 'uint256'},
      {name: 'verifyingContract', type: 'address'},
      {name: 'salt', type: 'bytes32'}
    ].filter(a => domain[a.name])
  };
  return ethers.utils.keccak256(encodeData('EIP712Domain', domain, types));
}

const structHash = (primaryType: string, data: any, types: any): string => {
  return ethers.utils.keccak256(encodeData(primaryType, data, types));
}

const digestToSign = (domain: any, primaryType: string, message: any, types: any): string => {
  return ethers.utils.keccak256(
    Buffer.concat([
      Buffer.from('1901', 'hex'),
      ethers.utils.arrayify(domainSeparator(domain)),
      ethers.utils.arrayify(structHash(primaryType, message, types)),
    ])
  );
}

const sign = (domain: any, primaryType: string, message: any, types: any, privateKey: string): any => {
  const digest = digestToSign(domain, primaryType, message, types);
  return {
    domain,
    primaryType,
    message,
    types,
    digest,
    ...ethUtil.ecsign(digest, ethUtil.toBuffer(privateKey))
  };
}


export {
  encodeType,
  typeHash,
  encodeData,
  domainSeparator,
  structHash,
  digestToSign,
  sign
};