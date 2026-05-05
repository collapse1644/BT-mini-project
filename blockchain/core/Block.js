const crypto = require("crypto");

class Block {
  constructor({
    index,
    timestamp = Date.now(),
    transactions = [],
    previousHash,
    nonce = 0,
    difficulty = 2,
    miner = null,
    hash
  }) {
    this.index = index;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.nonce = nonce;
    this.difficulty = difficulty;
    this.miner = miner;
    this.hash = hash || this.calculateHash();
  }

  calculateHash() {
    return crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          index: this.index,
          timestamp: this.timestamp,
          transactions: this.transactions,
          previousHash: this.previousHash,
          nonce: this.nonce,
          difficulty: this.difficulty,
          miner: this.miner
        })
      )
      .digest("hex");
  }

  static genesis() {
    return new Block({
      index: 0,
      timestamp: 1700000000000,
      transactions: [],
      previousHash: "0".repeat(64),
      nonce: 0,
      difficulty: 1
    });
  }

  static from(data) {
    return new Block(data);
  }
}

module.exports = Block;
