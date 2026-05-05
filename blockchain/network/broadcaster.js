async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json().catch(() => ({}));
}

function withoutExcludedPeer(peers, excludePeer) {
  if (!excludePeer) {
    return peers;
  }

  const normalizedExclude = excludePeer.replace(/\/+$/, "");
  return peers.filter((peer) => peer.replace(/\/+$/, "") !== normalizedExclude);
}

async function broadcastBlock(peers, block, selfUrl, { excludePeer = null } = {}) {
  const targetPeers = withoutExcludedPeer(peers, excludePeer);
  const payload = { block, from: selfUrl };
  const results = await Promise.allSettled(
    targetPeers.map((peer) => postJson(`${peer}/receive-block`, payload))
  );

  return results.map((result, index) => ({
    peer: targetPeers[index],
    ok: result.status === "fulfilled",
    error: result.status === "rejected" ? result.reason.message : null
  }));
}

async function broadcastTransaction(peers, transaction, selfUrl, { excludePeer = null } = {}) {
  const targetPeers = withoutExcludedPeer(peers, excludePeer);
  const payload = { transaction, from: selfUrl };
  const results = await Promise.allSettled(
    targetPeers.map((peer) => postJson(`${peer}/transaction`, payload))
  );

  return results.map((result, index) => ({
    peer: targetPeers[index],
    ok: result.status === "fulfilled",
    error: result.status === "rejected" ? result.reason.message : null
  }));
}

module.exports = {
  broadcastBlock,
  broadcastTransaction,
  postJson
};
