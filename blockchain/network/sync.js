const { isValidChain } = require("../validation/chainValidation");

async function fetchPeerChain(peer) {
  const response = await fetch(`${peer}/chain`);
  if (!response.ok) {
    throw new Error(`${peer} returned ${response.status}`);
  }

  const payload = await response.json();
  return payload.chain || payload;
}

async function syncLongestValidChain({ blockchain, peers }) {
  const results = await Promise.allSettled(peers.map(fetchPeerChain));
  let adopted = false;
  let bestChain = blockchain.getChain();

  for (const result of results) {
    if (result.status !== "fulfilled") {
      continue;
    }

    const candidate = result.value;
    if (candidate.length > bestChain.length && isValidChain(candidate)) {
      bestChain = candidate;
    }
  }

  if (bestChain.length > blockchain.getChain().length) {
    adopted = blockchain.replaceChain(bestChain);
  }

  return {
    adopted,
    localLength: blockchain.getChain().length,
    checkedPeers: peers.length,
    failures: results.filter((result) => result.status === "rejected").length
  };
}

module.exports = {
  fetchPeerChain,
  syncLongestValidChain
};
