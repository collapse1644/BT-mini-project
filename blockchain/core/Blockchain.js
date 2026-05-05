const Block = require("./Block");
const Transaction = require("./Transaction");
const { calculateDifficulty } = require("../consensus/difficulty");
const { mineBlock } = require("../consensus/proofOfWork");
const { isValidBlock } = require("../validation/blockValidation");
const { isValidChain } = require("../validation/chainValidation");
const { isValidTransaction } = require("../validation/transactionValidation");

class Blockchain {
  constructor({ chain, pendingTransactions } = {}) {
    this.chain = chain?.length ? chain.map(Block.from) : [Block.genesis()];
    this.pendingTransactions = pendingTransactions?.map(Transaction.from) || [];
    this.latestBlockCache = this.chain[this.chain.length - 1];
  }

  getLatestBlock() {
    return this.latestBlockCache;
  }

  getChain() {
    return this.chain;
  }

  getPendingTransactions() {
    return this.pendingTransactions;
  }

  addTransaction(transactionData) {
    const transaction = Transaction.from(transactionData);
    if (!isValidTransaction(transaction)) {
      throw new Error("Invalid transaction");
    }

    if (this.hasTransaction(transaction.id)) {
      throw new Error("Duplicate transaction");
    }

    this.pendingTransactions.push(transaction);
    return transaction;
  }

  hasTransaction(transactionId) {
    return (
      this.pendingTransactions.some((transaction) => transaction.id === transactionId) ||
      this.chain.some((block) =>
        block.transactions.some((transaction) => transaction.id === transactionId)
      )
    );
  }

  minePendingTransactions({ miner = "local-node", maxTransactions = 100 } = {}) {
    const pickedTransactions = this.pendingTransactions.slice(0, maxTransactions);
    if (pickedTransactions.length === 0) {
      throw new Error("No pending transactions to mine");
    }

    const latestBlock = this.getLatestBlock();
    const timestamp = Date.now();
    const block = new Block({
      index: latestBlock.index + 1,
      timestamp,
      transactions: pickedTransactions,
      previousHash: latestBlock.hash,
      difficulty: calculateDifficulty(latestBlock, timestamp),
      miner
    });

    const minedBlock = mineBlock(block);
    this.addBlock(minedBlock);
    const minedIds = new Set(pickedTransactions.map((transaction) => transaction.id));
    this.pendingTransactions = this.pendingTransactions.filter(
      (transaction) => !minedIds.has(transaction.id)
    );

    return minedBlock;
  }

  addBlock(blockData) {
    const block = Block.from(blockData);
    if (!isValidBlock(block, this.getLatestBlock())) {
      throw new Error("Invalid block");
    }

    this.chain.push(block);
    this.latestBlockCache = block;
    const minedIds = new Set(block.transactions.map((transaction) => transaction.id));
    this.pendingTransactions = this.pendingTransactions.filter(
      (transaction) => !minedIds.has(transaction.id)
    );
    return block;
  }

  replaceChain(candidateChain) {
    const normalized = candidateChain.map(Block.from);
    if (normalized.length <= this.chain.length) {
      return false;
    }

    if (!isValidChain(normalized)) {
      return false;
    }

    this.chain = normalized;
    this.latestBlockCache = normalized[normalized.length - 1];
    const minedIds = new Set(
      normalized.flatMap((block) => block.transactions.map((transaction) => transaction.id))
    );
    this.pendingTransactions = this.pendingTransactions.filter(
      (transaction) => !minedIds.has(transaction.id)
    );
    return true;
  }
}

module.exports = Blockchain;
