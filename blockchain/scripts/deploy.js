const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const LOCAL_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const demoRuns = [
  {
    player: "Astra",
    game: "Celeste",
    category: "Any%",
    timeSeconds: 2234,
    video: "https://example.com/videos/astra-celeste-anypercent.mp4"
  },
  {
    player: "ByteShift",
    game: "Hades",
    category: "Fresh File",
    timeSeconds: 1049,
    video: "https://example.com/videos/byteshift-hades-fresh-file.mp4"
  },
  {
    player: "NovaDash",
    game: "Super Meat Boy",
    category: "Light World",
    timeSeconds: 1788,
    video: "https://example.com/videos/novadash-smb-light-world.mp4"
  }
];

function buildProofHash(run) {
  return hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes(
      [run.player, run.game, run.category, run.timeSeconds, run.video].join("|")
    )
  );
}

function upsertEnvValue(envText, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(envText)) {
    return envText.replace(pattern, line);
  }
  return `${envText.trimEnd()}\n${line}\n`;
}

function writeBackendConfig(contractAddress, abi, deploymentBlock) {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const backendConfigDir = path.join(repoRoot, "backend", "src", "config");
  const backendEnvPath = path.join(repoRoot, "backend", ".env");
  const contractConfigPath = path.join(backendConfigDir, "contract.json");

  fs.mkdirSync(backendConfigDir, { recursive: true });

  fs.writeFileSync(
    contractConfigPath,
    JSON.stringify(
      {
        address: contractAddress,
        abi,
        chainId: 31337,
        network: "localhost",
        deployedBlock: deploymentBlock
      },
      null,
      2
    )
  );

  const defaultEnv = [
    "PORT=5000",
    "MONGO_URI=mongodb://127.0.0.1:27017/speedrun-verification",
    "RPC_URL=http://127.0.0.1:8545",
    "CHAIN_ID=31337",
    "CONTRACT_ADDRESS=",
    `PRIVATE_KEY=${LOCAL_PRIVATE_KEY}`,
    "UPLOAD_DIR=uploads",
    "FRONTEND_URL=http://localhost:5173",
    ""
  ].join("\n");

  const existingEnv = fs.existsSync(backendEnvPath)
    ? fs.readFileSync(backendEnvPath, "utf8")
    : defaultEnv;

  let nextEnv = upsertEnvValue(existingEnv, "CONTRACT_ADDRESS", contractAddress);
  nextEnv = upsertEnvValue(nextEnv, "RPC_URL", "http://127.0.0.1:8545");
  nextEnv = upsertEnvValue(nextEnv, "CHAIN_ID", "31337");
  nextEnv = upsertEnvValue(nextEnv, "PRIVATE_KEY", LOCAL_PRIVATE_KEY);

  fs.writeFileSync(backendEnvPath, nextEnv);
}

function writeDemoMetadata(deployment, receiptByHash) {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const outputPath = path.join(repoRoot, "backend", "src", "config", "demo-runs.json");
  const records = demoRuns.map((run) => {
    const proofHash = buildProofHash(run);
    const receipt = receiptByHash.get(proofHash);
    return {
      player: run.player,
      game: run.game,
      category: run.category,
      timeSeconds: run.timeSeconds,
      proofHash,
      videoType: "url",
      videoUrl: run.video,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      contractAddress: deployment.address
    };
  });

  fs.writeFileSync(outputPath, JSON.stringify(records, null, 2));
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const startingBlock = await hre.ethers.provider.getBlockNumber();

  console.log(`Deploying with ${deployer.address}`);
  console.log(`Local chain is running. Current block: ${startingBlock}`);

  const SpeedrunRegistry = await hre.ethers.getContractFactory("SpeedrunRegistry");
  const registry = await SpeedrunRegistry.deploy();
  await registry.waitForDeployment();

  const contractAddress = await registry.getAddress();
  const deploymentTx = registry.deploymentTransaction();
  const deploymentReceipt = await deploymentTx.wait();
  const artifact = await hre.artifacts.readArtifact("SpeedrunRegistry");

  const receiptByHash = new Map();
  for (const run of demoRuns) {
    const proofHash = buildProofHash(run);
    const tx = await registry.submitRun(
      run.player,
      run.game,
      run.category,
      run.timeSeconds,
      proofHash
    );
    const receipt = await tx.wait();
    receiptByHash.set(proofHash, receipt);
    console.log(`Seeded ${run.player} - ${run.game}: ${receipt.hash}`);
  }

  writeBackendConfig(contractAddress, artifact.abi, deploymentReceipt.blockNumber);
  writeDemoMetadata({ address: contractAddress }, receiptByHash);

  console.log(`SpeedrunRegistry deployed to ${contractAddress}`);
  console.log("Backend contract config and .env were updated.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
