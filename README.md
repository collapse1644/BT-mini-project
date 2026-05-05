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
  core/Block.js
  core/Blockchain.js
  core/Transaction.js
  consensus/proofOfWork.js
  consensus/difficulty.js
  network/peerManager.js
  network/broadcaster.js
  network/sync.js
  validation/blockValidation.js
  validation/chainValidation.js
  validation/transactionValidation.js
  storage/db.js
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

The Node.js blockchain network is now modular:

- `core/` is pure blockchain logic only.
- `consensus/` contains nonce-based proof-of-work and dynamic difficulty.
- `validation/` contains reusable transaction, block, and chain validators.
- `network/` handles peers, latest-block broadcast, and longest-valid-chain sync.
- `storage/` persists chain state, mempool, peers, and speedrun metadata to MongoDB.

The older Hardhat/Solidity files remain in the repo, but the Express app now runs as an independent decentralized HTTP blockchain node.

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

## Run A Multi-Node Blockchain Network

Start MongoDB first, then run three backend nodes in separate terminals:

```bash
npm run server:5000
npm run server:5001
npm run server:5002
```

Node defaults:

- Node A: `http://localhost:5000`
- Node B: `http://localhost:5001`, peers with Node A
- Node C: `http://localhost:5002`, peers with Node A and Node B

You can add peers manually:

```bash
curl -X POST http://localhost:5000/add-peer \
  -H "Content-Type: application/json" \
  -d "{\"peer\":\"http://localhost:5001\"}"
```

Submit a transaction to Node A:

```bash
curl -X POST http://localhost:5000/transaction \
  -H "Content-Type: application/json" \
  -d "{\"player\":\"Astra\",\"game\":\"Celeste\",\"category\":\"Any%\",\"timeSeconds\":2234,\"videoUrl\":\"https://example.com/astra.mp4\"}"
```

Mine pending transactions on Node A:

```bash
curl -X POST http://localhost:5000/mine
```

Check Node B and Node C:

```bash
curl http://localhost:5001/chain
curl http://localhost:5002/chain
```

If a node missed a block, trigger lazy longest-chain sync:

```bash
curl http://localhost:5001/sync
```

## Run Across Devices With Tailscale

Each node advertises its own Tailscale URL with `NODE_URL` and learns many peers from `PEERS`. There is no master node.

Node A on `100.119.178.65`:

```env
PORT=5000
HOST=0.0.0.0
NODE_ID=tailscale-node-a
NODE_URL=http://100.119.178.65:5000
PEERS=http://100.82.8.118:5000
SYNC_INTERVAL_MS=5000
```

Node B on `100.82.8.118`:

```env
PORT=5000
HOST=0.0.0.0
NODE_ID=tailscale-node-b
NODE_URL=http://100.82.8.118:5000
PEERS=http://100.119.178.65:5000
SYNC_INTERVAL_MS=5000
```

Convenience scripts:

```bash
npm run server:tailscale:a
npm run server:tailscale:b
```

For a frontend on another device, point Vite at the node you want to use:

```bash
set VITE_API_BASE=http://100.119.178.65:5000
npm run client
```

You can add more peers at runtime from either side:

```bash
curl -X POST http://100.119.178.65:5000/add-peer \
  -H "Content-Type: application/json" \
  -d "{\"peer\":\"http://100.82.8.118:5000\"}"
```

Mine on Node A:

```bash
curl -X POST http://100.119.178.65:5000/transaction \
  -H "Content-Type: application/json" \
  -d "{\"player\":\"MeshRunner\",\"game\":\"Celeste\",\"category\":\"Any%\",\"timeSeconds\":2200,\"videoUrl\":\"https://example.com/mesh.mp4\"}"

curl -X POST http://100.119.178.65:5000/mine
```

Node B receives the latest block by broadcast. Periodic sync also runs every 5 seconds, so missed broadcasts are repaired by longest-valid-chain conflict resolution:

```bash
curl http://100.82.8.118:5000/chain
```

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

Decentralized node APIs:

```bash
POST /transaction
POST /mine
GET  /chain
POST /receive-block
POST /add-peer
GET  /peers
GET  /sync
GET  /node/status
```

The frontend-compatible APIs are still available:

```bash
POST /api/submit-run
GET  /api/runs
GET  /api/events
```

## Verification Rules

- `player`, `game`, and `category` must be non-empty.
- `time` must be an integer from `1` to `36000` seconds.
- A video upload or `http(s)` video URL is required.
- The proof hash is `sha256(player + game + category + time + video)`.
- Uploaded files use a SHA-256 hash of the file bytes as the video proof component.
- Duplicate transactions are rejected by each node.
- Submitted runs become transactions, pending transactions live in the mempool, and mining turns them into immutable blocks.
- Each node independently validates transaction shape, block hashes, previous-hash links, and proof-of-work difficulty.

## Consensus And Sync

- Mining uses nonce-based proof of work.
- Difficulty adjusts dynamically around a target block time and defaults to at least four leading zeroes.
- Nodes broadcast only the newest mined block, not the full chain.
- If a node receives a future block it cannot append, it lazily syncs from peers.
- Conflict resolution adopts the longest valid chain only when it is longer and passes full validation.
- Nodes also run periodic sync every 5 seconds by default.
- Transactions and accepted blocks are relayed to peers other than the sender, so the network behaves as a mesh instead of a hub-and-spoke setup.

## Contract

`SpeedrunRegistry` stores each verified run as:

- player name
- game name
- category
- time in seconds
- proof hash
- block timestamp

It exposes `submitRun(...)`, `getRuns()`, `totalRuns()`, prevents duplicate proof hashes, and emits `RunSubmitted` for live leaderboard refreshes.
