function meetsDifficulty(hash, difficulty) {
  return hash.startsWith("0".repeat(difficulty));
}

function mineBlock(block) {
  while (!meetsDifficulty(block.hash, block.difficulty)) {
    block.nonce += 1;
    block.hash = block.calculateHash();
  }

  return block;
}

module.exports = {
  meetsDifficulty,
  mineBlock
};
