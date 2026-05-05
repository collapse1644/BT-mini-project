const express = require("express");
const nodeBlockchain = require("../services/nodeBlockchainService");

const router = express.Router();

router.post("/transaction", async (req, res, next) => {
  try {
    const fromPeer = req.body.from || null;
    let transaction;

    if (req.body.transaction) {
      transaction = await nodeBlockchain.addTransaction(req.body.transaction, {
        broadcast: true,
        excludePeer: fromPeer
      });
    } else {
      transaction = await nodeBlockchain.createSpeedrunTransaction(
        {
          ...req.body,
          videoReference: req.body.videoReference || req.body.videoUrl || req.body.video
        },
        { broadcast: true, excludePeer: fromPeer }
      );
    }

    res.status(201).json({
      success: true,
      transaction,
      mempoolSize: nodeBlockchain.blockchain.getPendingTransactions().length
    });
  } catch (error) {
    if (fromPeer && error.message.includes("Duplicate")) {
      return res.json({
        success: true,
        duplicate: true,
        mempoolSize: nodeBlockchain.blockchain.getPendingTransactions().length
      });
    }

    if (error.message.includes("Duplicate")) {
      error.statusCode = 409;
    } else if (error.message.includes("Invalid") || error.message.includes("required")) {
      error.statusCode = 400;
    }
    next(error);
  }
});

router.post("/mine", async (_req, res, next) => {
  try {
    const block = await nodeBlockchain.minePendingTransactions();
    res.status(201).json({
      success: true,
      block
    });
  } catch (error) {
    if (error.message.includes("No pending")) {
      error.statusCode = 400;
    }
    next(error);
  }
});

router.get("/chain", (_req, res) => {
  res.json({
    ...nodeBlockchain.getStatus(),
    chain: nodeBlockchain.blockchain.getChain(),
    pendingTransactions: nodeBlockchain.blockchain.getPendingTransactions()
  });
});

router.post("/receive-block", async (req, res, next) => {
  try {
    const result = await nodeBlockchain.receiveBlock(req.body.block, req.body.from);
    res.json({
      success: result.accepted,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

router.post("/add-peer", async (req, res, next) => {
  try {
    const peers = await nodeBlockchain.addPeer(req.body.peer || req.body.url);
    res.status(201).json({
      success: true,
      peers
    });
  } catch (error) {
    error.statusCode = 400;
    next(error);
  }
});

router.get("/peers", (_req, res) => {
  res.json({
    nodeId: nodeBlockchain.nodeId,
    peers: nodeBlockchain.peerManager.getPeers()
  });
});

router.get("/sync", async (_req, res, next) => {
  try {
    const result = await nodeBlockchain.sync();
    res.json({
      success: true,
      ...result,
      latestBlock: nodeBlockchain.blockchain.getLatestBlock()
    });
  } catch (error) {
    next(error);
  }
});

router.get("/node/status", (_req, res) => {
  res.json(nodeBlockchain.getStatus());
});

module.exports = router;
