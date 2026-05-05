const TARGET_BLOCK_TIME_MS = 10_000;
const MIN_DIFFICULTY = 4;
const MAX_DIFFICULTY = 5;

function calculateDifficulty(latestBlock, now = Date.now()) {
  if (!latestBlock) {
    return MIN_DIFFICULTY;
  }

  const previousDifficulty = latestBlock.difficulty || MIN_DIFFICULTY;
  const elapsed = now - latestBlock.timestamp;

  if (elapsed < TARGET_BLOCK_TIME_MS / 2) {
    return Math.min(previousDifficulty + 1, MAX_DIFFICULTY);
  }

  if (elapsed > TARGET_BLOCK_TIME_MS * 2) {
    return Math.max(previousDifficulty - 1, MIN_DIFFICULTY);
  }

  return previousDifficulty;
}

module.exports = {
  TARGET_BLOCK_TIME_MS,
  calculateDifficulty
};
