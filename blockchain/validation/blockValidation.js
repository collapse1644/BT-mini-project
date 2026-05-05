const Block = require("../core/Block");
const { calculateDifficulty } = require("../consensus/difficulty");
const { meetsDifficulty } = require("../consensus/proofOfWork");
const { isValidTransaction } = require("./transactionValidation");

function isValidBlock(block, previousBlock) {
  if (!block || !previousBlock) {
    return false;
  }

  const candidate = Block.from(block);

  if (candidate.index !== previousBlock.index + 1) {
    return false;
  }

  if (candidate.previousHash !== previousBlock.hash) {
    return false;
  }

  if (candidate.hash !== candidate.calculateHash()) {
    return false;
  }

  if (!meetsDifficulty(candidate.hash, candidate.difficulty)) {
    return false;
  }

  if (candidate.difficulty !== calculateDifficulty(previousBlock, candidate.timestamp)) {
    return false;
  }

  if (!Array.isArray(candidate.transactions)) {
    return false;
  }

  return candidate.transactions.every(isValidTransaction);
}

module.exports = {
  isValidBlock
};
