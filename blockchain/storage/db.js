function getCollection(connection, name) {
  return connection.collection(name);
}

class BlockchainMongoStorage {
  constructor({ connection, nodeId }) {
    this.connection = connection;
    this.nodeId = nodeId;
    this.blocks = getCollection(connection, "node_blocks");
    this.transactions = getCollection(connection, "node_pending_transactions");
    this.peers = getCollection(connection, "node_peers");
    this.runMetadata = getCollection(connection, "runmetadatas");
  }

  async loadState() {
    const blocks = await this.blocks
      .find({ nodeId: this.nodeId })
      .sort({ index: 1 })
      .toArray();
    const pendingTransactions = await this.transactions
      .find({ nodeId: this.nodeId })
      .sort({ timestamp: 1 })
      .toArray();
    const peers = await this.peers.find({ nodeId: this.nodeId }).toArray();

    return {
      chain: blocks.map(({ _id, nodeId, ...block }) => block),
      pendingTransactions: pendingTransactions.map(({ _id, nodeId, ...transaction }) => transaction),
      peers: peers.map((peer) => peer.url)
    };
  }

  async saveChain(chain) {
    await this.blocks.deleteMany({ nodeId: this.nodeId });
    if (chain.length === 0) {
      return;
    }

    await this.blocks.insertMany(chain.map((block) => ({ ...block, nodeId: this.nodeId })));
  }

  async saveBlock(block) {
    await this.blocks.updateOne(
      { nodeId: this.nodeId, index: block.index },
      { $set: { ...block, nodeId: this.nodeId } },
      { upsert: true }
    );
  }

  async savePendingTransactions(transactions) {
    await this.transactions.deleteMany({ nodeId: this.nodeId });
    if (transactions.length === 0) {
      return;
    }

    await this.transactions.insertMany(
      transactions.map((transaction) => ({ ...transaction, nodeId: this.nodeId }))
    );
  }

  async savePeer(url) {
    await this.peers.updateOne(
      { nodeId: this.nodeId, url },
      { $set: { nodeId: this.nodeId, url } },
      { upsert: true }
    );
  }

  async saveRunMetadata(metadata) {
    await this.runMetadata.updateOne(
      { proofHash: metadata.proofHash },
      { $set: metadata },
      { upsert: true }
    );
  }

  async getRunMetadataByProofHashes(proofHashes) {
    const records = await this.runMetadata.find({ proofHash: { $in: proofHashes } }).toArray();
    return new Map(records.map((record) => [record.proofHash, record]));
  }
}

module.exports = BlockchainMongoStorage;
