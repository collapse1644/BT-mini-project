function isValidTransaction(transaction) {
  if (!transaction || typeof transaction !== "object") {
    return false;
  }

  if (!transaction.id || typeof transaction.id !== "string") {
    return false;
  }

  if (!transaction.type || typeof transaction.type !== "string") {
    return false;
  }

  if (!transaction.payload || typeof transaction.payload !== "object") {
    return false;
  }

  if (!Number.isFinite(Number(transaction.timestamp))) {
    return false;
  }

  if (transaction.type === "speedrun") {
    const { player, game, category, timeSeconds, proofHash } = transaction.payload;
    return Boolean(player && game && category && proofHash && Number(timeSeconds) > 0);
  }

  return true;
}

module.exports = {
  isValidTransaction
};
