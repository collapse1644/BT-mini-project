class PeerManager {
  constructor(initialPeers = []) {
    this.peers = new Set();
    initialPeers.forEach((peer) => this.addPeer(peer));
  }

  addPeer(peerUrl) {
    const normalized = PeerManager.normalizePeer(peerUrl);
    if (normalized) {
      this.peers.add(normalized);
    }
    return normalized;
  }

  removePeer(peerUrl) {
    const normalized = PeerManager.normalizePeer(peerUrl);
    return this.peers.delete(normalized);
  }

  getPeers() {
    return [...this.peers].sort();
  }

  static normalizePeer(peerUrl) {
    if (!peerUrl || typeof peerUrl !== "string") {
      return null;
    }

    const trimmed = peerUrl.trim().replace(/\/+$/, "");
    try {
      const parsed = new URL(trimmed);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return null;
      }
      return parsed.toString().replace(/\/+$/, "");
    } catch (_error) {
      return null;
    }
  }
}

module.exports = PeerManager;
