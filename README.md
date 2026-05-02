# Decentralized Speedrun Verification System

A complete local full-stack dApp for submitting speedrun results, validating basic anti-cheat rules, storing video metadata in MongoDB, and writing tamper-proof run proofs to a local Hardhat Ethereum chain.

## Stack

- Blockchain: Hardhat local Ethereum network
- Smart contract: Solidity `SpeedrunRegistry`
- Backend: Node.js, Express.js, Ethers.js, Multer, MongoDB
- Frontend: React.js with Vite

## Project Structure

```text
blockchain/
  contracts/SpeedrunRegistry.sol
  scripts/deploy.js
  hardhat.config.js
backend/
  src/index.js
  src/routes/runs.js
  src/models/RunMetadata.js
  src/services/contractService.js
  uploads/
frontend/
  src/App.jsx
  src/styles.css
```

## Setup

Install dependencies for all three apps:

```bash
npm run install:all
```

Start MongoDB locally on `mongodb://127.0.0.1:27017`. The backend uses database `speedrun-verification`.

## Run Locally

Use separate terminals.

1. Start the local blockchain:

```bash
npm run node
```

Hardhat creates the local chain and genesis block automatically when the node starts.

2. Deploy the contract and seed three demo runs on-chain:

```bash
npm run deploy
```

Deployment writes the ABI and contract address to `backend/src/config/contract.json`, updates `backend/.env`, and writes demo metadata to `backend/src/config/demo-runs.json`.

3. Start the backend:

```bash
npm run server
```

The backend connects to MongoDB, imports the demo metadata if needed, and serves the API on `http://localhost:5000`.

4. Start the frontend:

```bash
npm run client
```

Open `http://127.0.0.1:5173`.

## API

Submit with a video URL:

```bash
curl -X POST http://localhost:5000/api/submit-run \
  -F "player=RunnerOne" \
  -F "game=Celeste" \
  -F "category=Any%" \
  -F "time=2140" \
  -F "videoUrl=https://example.com/runnerone-celeste.mp4"
```

Submit with a local video file:

```bash
curl -X POST http://localhost:5000/api/submit-run \
  -F "player=RunnerTwo" \
  -F "game=Hades" \
  -F "category=Fresh File" \
  -F "time=998" \
  -F "video=@./sample-run.mp4"
```

Fetch leaderboard:

```bash
curl http://localhost:5000/api/runs
```

Live events:

```bash
curl http://localhost:5000/api/events
```

## Verification Rules

- `player`, `game`, and `category` must be non-empty.
- `time` must be an integer from `1` to `36000` seconds.
- A video upload or `http(s)` video URL is required.
- The proof hash is `keccak256(player + game + category + time + video)`.
- Uploaded files use a keccak256 hash of the file bytes as the video proof component.
- Duplicate proof hashes are rejected by both the backend and the smart contract.
- Only the backend writes to the contract with the configured local Hardhat private key.

## Contract

`SpeedrunRegistry` stores each verified run as:

- player name
- game name
- category
- time in seconds
- proof hash
- block timestamp

It exposes `submitRun(...)`, `getRuns()`, `totalRuns()`, prevents duplicate proof hashes, and emits `RunSubmitted` for live leaderboard refreshes.
