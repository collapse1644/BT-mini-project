const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const nodeBlockchain = require("../services/nodeBlockchainService");

const router = express.Router();
const backendRoot = path.resolve(__dirname, "..", "..");
const configuredUploadDir = process.env.UPLOAD_DIR || "uploads";
const uploadDir = path.isAbsolute(configuredUploadDir)
  ? configuredUploadDir
  : path.resolve(backendRoot, configuredUploadDir);
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeBase = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-z0-9_-]/gi, "-")
      .toLowerCase();
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${safeBase}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Uploaded proof must be a video file."));
  }
});

function fileHash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

router.post("/submit-run", upload.single("video"), async (req, res, next) => {
  try {
    console.log("Request received:", {
      player: req.body.player,
      game: req.body.game,
      category: req.body.category,
      time: req.body.time,
      videoUrl: req.body.videoUrl || req.body.video || null,
      videoFile: req.file?.originalname || null
    });

    if (!req.file && !(req.body.videoUrl || req.body.video)) {
      return res.status(400).json({ message: "Provide either a video upload or a video URL." });
    }

    const videoReference = req.file ? fileHash(req.file.path) : req.body.videoUrl || req.body.video;
    const storedVideoPath = req.file ? `/uploads/${req.file.filename}` : null;
    const transaction = await nodeBlockchain.createSpeedrunTransaction({
      player: req.body.player,
      game: req.body.game,
      category: req.body.category,
      timeSeconds: req.body.time,
      videoReference,
      videoType: req.file ? "file" : "url",
      videoPath: storedVideoPath,
      videoUrl: req.file ? null : req.body.videoUrl || req.body.video,
      videoOriginalName: req.file?.originalname || null
    });
    const block = await nodeBlockchain.minePendingTransactions();

    return res.status(201).json({
      message: "Run submitted as a transaction and mined into the local blockchain node.",
      transactionHash: transaction.id,
      proofHash: transaction.payload.proofHash,
      blockNumber: block.index,
      blockHash: block.hash,
      run: transaction.payload
    });
  } catch (error) {
    if (req.file) {
      fs.promises.unlink(req.file.path).catch(() => {});
    }

    if (error.message.includes("Duplicate")) {
      error.statusCode = 409;
    } else if (
      error.message.includes("required") ||
      error.message.includes("Time") ||
      error.message.includes("Invalid")
    ) {
      error.statusCode = 400;
    }

    next(error);
  }
});

router.get("/runs", async (_req, res, next) => {
  try {
    const latestBlock = nodeBlockchain.blockchain.getLatestBlock();
    const runs = await nodeBlockchain.getRuns();

    res.json({
      network: {
        chainId: 31337,
        latestBlockNumber: latestBlock.index,
        latestBlockTimestamp: Math.floor(latestBlock.timestamp / 1000),
        contractAddress: nodeBlockchain.nodeId,
        nodeUrl: nodeBlockchain.selfUrl,
        latestHash: latestBlock.hash,
        peers: nodeBlockchain.peerManager.getPeers()
      },
      runs
    });
  } catch (error) {
    next(error);
  }
});

router.get("/events", async (req, res, next) => {
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const onBlock = (block) => {
      res.write("event: run-submitted\n");
      res.write(`data: ${JSON.stringify({ blockNumber: block.index, blockHash: block.hash })}\n\n`);
    };

    nodeBlockchain.on("block", onBlock);
    res.write(`event: connected\ndata: ${JSON.stringify(nodeBlockchain.getStatus())}\n\n`);

    req.on("close", () => {
      nodeBlockchain.off("block", onBlock);
      res.end();
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
