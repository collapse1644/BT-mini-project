const crypto = require("crypto");
const EventEmitter = require("events");
const Blockchain = require("../../../blockchain/core/Blockchain");
const Transaction = require("../../../blockchain/core/Transaction");
const PeerManager = require("../../../blockchain/network/peerManager");
const { broadcastBlock, broadcastTransaction } = require("../../../blockchain/network/broadcaster");
const { syncLongestValidChain } = require("../../../blockchain/network/sync");
const BlockchainMongoStorage = require("../../../blockchain/storage/db");

const MAX_SECONDS = 10 * 60 * 60;

function getNodeId() {
  return process.env.NODE_ID || `node-${process.env.PORT || 5000}`;
}

function getSelfUrl() {
  return (process.env.NODE_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, "");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function createProofHash({ player, game, category, timeSeconds, videoReference }) {
  return crypto
    .createHash("sha256")
    .update([player, game, category, timeSeconds, videoReference].join("|"))
    .digest("hex");
}

function validateRunInput({ player, game, category, timeSeconds, videoReference }) {
  if (!player || !game || !category) {
    throw new Error("Player, game, and category are required");
  }

  if (!Number.isInteger(Number(timeSeconds)) || Number(timeSeconds) <= 0 || Number(timeSeconds) > MAX_SECONDS) {
    throw new Error("Time must be between 1 second and 10 hours.");
  }

  if (!videoReference) {
    throw new Error("Video proof is required");
  }
}

class NodeBlockchainService extends EventEmitter {
  constructor() {
    super();
    this.nodeId = getNodeId();
    this.selfUrl = getSelfUrl();
    this.blockchain = new Blockchain();
    this.peerManager = new PeerManager();
    this.storage = null;
    this.ready = false;
  }

  async initialize(connection) {
    this.storage = new BlockchainMongoStorage({
      connection,
      nodeId: this.nodeId
    });

    const state = await this.storage.loadState();
    this.blockchain = new Blockchain(state);
    this.peerManager = new PeerManager([
      ...state.peers,
      ...(process.env.PEERS ? process.env.PEERS.split(",") : [])
    ]);

    await Promise.all(this.peerManager.getPeers().map((peer) => this.storage.savePeer(peer)));
    this.ready = true;

    if (this.peerManager.getPeers().length > 0) {
      await this.sync();
    }
  }

  assertReady() {
    if (!this.ready || !this.storage) {
      throw new Error("Blockchain node service is not initialized");
    }
  }

  getStatus() {
    return {
      nodeId: this.nodeId,
      nodeUrl: this.selfUrl,
      height: this.blockchain.getLatestBlock().index,
      latestHash: this.blockchain.getLatestBlock().hash,
      peers: this.peerManager.getPeers(),
      pendingTransactions: this.blockchain.getPendingTransactions().length
    };
  }

  async addPeer(peerUrl) {
    this.assertReady();
    const peer = this.peerManager.addPeer(peerUrl);
    if (!peer) {
      throw new Error("Invalid peer URL");
    }

    if (peer === this.selfUrl) {
      throw new Error("Cannot add this node as its own peer");
    }

    await this.storage.savePeer(peer);
    return this.peerManager.getPeers();
  }

  async createSpeedrunTransaction(input, { broadcast = true } = {}) {
    this.assertReady();

    const player = normalizeText(input.player);
    const game = normalizeText(input.game);
    const category = normalizeText(input.category);
    const timeSeconds = Number(input.timeSeconds || input.time);
    const videoReference = normalizeText(input.videoReference);
    validateRunInput({ player, game, category, timeSeconds, videoReference });

    const proofHash = input.proofHash || createProofHash({
      player,
      game,
      category,
      timeSeconds,
      videoReference
    });

    const transaction = new Transaction({
      type: "speedrun",
      submitter: player,
      payload: {
        player,
        game,
        category,
        timeSeconds,
        proofHash,
        videoReference,
        videoType: input.videoType || "url",
        videoPath: input.videoPath || null,
        videoUrl: input.videoUrl || null,
        videoOriginalName: input.videoOriginalName || null
      }
    });

    const added = this.blockchain.addTransaction(transaction);
    await this.storage.savePendingTransactions(this.blockchain.getPendingTransactions());
    await this.storage.saveRunMetadata({
      proofHash,
      player,
      game,
      category,
      timeSeconds,
      videoType: transaction.payload.videoType,
      videoPath: transaction.payload.videoPath,
      videoUrl: transaction.payload.videoUrl,
      videoOriginalName: transaction.payload.videoOriginalName,
      transactionHash: added.id,
      blockNumber: null,
      contractAddress: this.nodeId
    });

    if (broadcast) {
      broadcastTransaction(this.peerManager.getPeers(), added, this.selfUrl).catch((error) => {
        console.error("Transaction broadcast failed:", error.message);
      });
    }

    return added;
  }

  async addTransaction(transactionData, { broadcast = true } = {}) {
    this.assertReady();
    const added = this.blockchain.addTransaction(transactionData);
    await this.storage.savePendingTransactions(this.blockchain.getPendingTransactions());

    if (broadcast) {
      await broadcastTransaction(this.peerManager.getPeers(), added, this.selfUrl);
    }

    return added;
  }

  async minePendingTransactions() {
    this.assertReady();
    const block = this.blockchain.minePendingTransactions({ miner: this.nodeId });
    await this.storage.saveBlock(block);
    await this.storage.savePendingTransactions(this.blockchain.getPendingTransactions());

    await Promise.all(
      block.transactions
        .filter((transaction) => transaction.type === "speedrun")
        .map((transaction) =>
          this.storage.saveRunMetadata({
            proofHash: transaction.payload.proofHash,
            player: transaction.payload.player,
            game: transaction.payload.game,
            category: transaction.payload.category,
            timeSeconds: transaction.payload.timeSeconds,
            videoType: transaction.payload.videoType,
            videoPath: transaction.payload.videoPath,
            videoUrl: transaction.payload.videoUrl,
            videoOriginalName: transaction.payload.videoOriginalName,
            transactionHash: transaction.id,
            blockNumber: block.index,
            contractAddress: this.nodeId
          })
        )
    );

    this.emit("block", block);
    broadcastBlock(this.peerManager.getPeers(), block, this.selfUrl).catch((error) => {
      console.error("Block broadcast failed:", error.message);
    });

    return block;
  }

  async receiveBlock(block, fromPeer) {
    this.assertReady();

    try {
      const added = this.blockchain.addBlock(block);
      await this.storage.saveBlock(added);
      await this.storage.savePendingTransactions(this.blockchain.getPendingTransactions());
      this.emit("block", added);
      return { accepted: true, conflict: false, block: added };
    } catch (_error) {
      if (block.index > this.blockchain.getLatestBlock().index) {
        const peers = fromPeer
          ? [...new Set([fromPeer, ...this.peerManager.getPeers()])]
          : this.peerManager.getPeers();
        const result = await this.sync(peers);
        return { accepted: false, conflict: true, sync: result };
      }

      return { accepted: false, conflict: false };
    }
  }

  async sync(peers = this.peerManager.getPeers()) {
    this.assertReady();
    const result = await syncLongestValidChain({
      blockchain: this.blockchain,
      peers
    });

    if (result.adopted) {
      await this.storage.saveChain(this.blockchain.getChain());
      await this.storage.savePendingTransactions(this.blockchain.getPendingTransactions());
      this.emit("sync", this.blockchain.getLatestBlock());
    }

    return result;
  }

  async getRuns() {
    this.assertReady();
    const speedrunEntries = this.blockchain
      .getChain()
      .flatMap((block) =>
        block.transactions
          .filter((transaction) => transaction.type === "speedrun")
          .map((transaction) => ({ block, transaction }))
      );

    const metadata = await this.storage.getRunMetadataByProofHashes(
      speedrunEntries.map(({ transaction }) => transaction.payload.proofHash)
    );

    return speedrunEntries
      .map(({ block, transaction }, index) => {
        const record = metadata.get(transaction.payload.proofHash);
        return {
          id: index,
          player: transaction.payload.player,
          game: transaction.payload.game,
          category: transaction.payload.category,
          timeSeconds: transaction.payload.timeSeconds,
          proofHash: transaction.payload.proofHash,
          timestamp: Math.floor(block.timestamp / 1000),
          verified: true,
          transactionHash: transaction.id,
          blockNumber: block.index,
          blockHash: block.hash,
          videoType: record?.videoType || transaction.payload.videoType,
          videoPath: record?.videoPath || transaction.payload.videoPath,
          videoUrl: record?.videoUrl || transaction.payload.videoUrl,
          submittedAt: record?.createdAt || null
        };
      })
      .sort((a, b) => a.timeSeconds - b.timeSeconds);
  }
}

module.exports = new NodeBlockchainService();
