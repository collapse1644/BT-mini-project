const path = require("path");
const { ethers } = require("ethers");

const contractConfig = require("../config/contract.json");

function getContractAddress() {
  return process.env.CONTRACT_ADDRESS || contractConfig.address;
}

function assertContractConfig() {
  const address = getContractAddress();
  if (!address || !ethers.isAddress(address)) {
    throw new Error("SpeedrunRegistry is not deployed. Run `npm run deploy` first.");
  }

  if (!Array.isArray(contractConfig.abi) || contractConfig.abi.length === 0) {
    throw new Error(
      `Missing ABI in ${path.join("backend", "src", "config", "contract.json")}. Run deployment again.`
    );
  }

  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is missing from backend .env.");
  }
}

function createProvider() {
  return new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545");
}

function createContract() {
  assertContractConfig();
  const provider = createProvider();
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  return new ethers.Contract(getContractAddress(), contractConfig.abi, wallet);
}

function createReadOnlyContract() {
  assertContractConfig();
  return new ethers.Contract(getContractAddress(), contractConfig.abi, createProvider());
}

function generateProofHash({ player, game, category, timeSeconds, videoReference }) {
  return ethers.keccak256(
    ethers.toUtf8Bytes([player, game, category, timeSeconds, videoReference].join("|"))
  );
}

module.exports = {
  createContract,
  createProvider,
  createReadOnlyContract,
  generateProofHash,
  getContractAddress
};
