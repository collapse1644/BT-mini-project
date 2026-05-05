const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { ethers } = require("ethers");
const RunMetadata = require("../models/RunMetadata");
const {
  createContract,
  createProvider,
  createReadOnlyContract,
  generateProofHash,
  getContractAddress
} = require("../services/contractService");

const router = express.Router();
const MAX_SECONDS = 10 * 60 * 60;

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

function normalizeText(value) {
  return String(value || "").trim();
}

function parseRunInput(body) {
  const player = normalizeText(body.player);
  const game = normalizeText(body.game);
  const category = normalizeText(body.category);
  const timeSeconds = Number(body.time);
  const videoUrl = normalizeText(body.videoUrl || body.video);

  const missing = [];
  if (!player) missing.push("player");
  if (!game) missing.push("game");
  if (!category) missing.push("category");
  if (!Number.isInteger(timeSeconds)) missing.push("time");

  if (missing.length > 0) {
    const error = new Error(`Missing or invalid fields: ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  if (timeSeconds <= 0 || timeSeconds > MAX_SECONDS) {
    const error = new Error("Time must be between 1 second and 10 hours.");
    error.statusCode = 400;
    throw error;
  }

  if (videoUrl) {
    try {
      const parsed = new URL(videoUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch (_error) {
      const error = new Error("Video URL must be a valid http(s) URL.");
      error.statusCode = 400;
      throw error;
    }
  }

  return { player, game, category, timeSeconds, videoUrl };
}

function toSerializableRun(chainRun, metadata, index) {
  const timestamp = Number(chainRun.timestamp);
  return {
    id: index,
    player: chainRun.player,
    game: chainRun.game,
    category: chainRun.category,
    timeSeconds: Number(chainRun.timeSeconds),
    proofHash: chainRun.proofHash,
    timestamp,
    verified: true,
    transactionHash: metadata?.transactionHash || null,
    blockNumber: metadata?.blockNumber || null,
    videoType: metadata?.videoType || null,
    videoPath: metadata?.videoPath || null,
    videoUrl: metadata?.videoUrl || null,
    submittedAt: metadata?.createdAt || null
  };
}

async function getMergedRuns() {
  const contract = createReadOnlyContract();
  const chainRuns = await contract.getRuns();
  const proofHashes = chainRuns.map((run) => String(run.proofHash).toLowerCase());
  const metadata = await RunMetadata.find({ proofHash: { $in: proofHashes } }).lean();
  const metadataByProof = new Map(metadata.map((record) => [record.proofHash.toLowerCase(), record]));

  return chainRuns
    .map((run, index) => toSerializableRun(run, metadataByProof.get(run.proofHash.toLowerCase()), index))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
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

    const input = parseRunInput(req.body);

    if (!req.file && !input.videoUrl) {
      return res.status(400).json({ message: "Provide either a video upload or a video URL." });
    }

    const videoReference = req.file
      ? ethers.keccak256(fs.readFileSync(req.file.path))
      : input.videoUrl;
    const storedVideoPath = req.file ? `/uploads/${req.file.filename}` : null;
    const proofHash = generateProofHash({ ...input, videoReference }).toLowerCase();

    const existingMetadata = await RunMetadata.findOne({ proofHash });
    if (existingMetadata) {
      return res.status(409).json({ message: "Duplicate proof hash. This run was already submitted." });
    }

    const contract = createContract();
    const alreadyOnChain = await contract.proofHashExists(proofHash);
    if (alreadyOnChain) {
      return res.status(409).json({ message: "Duplicate proof hash exists on-chain." });
    }

    const tx = await contract.submitRun(
      input.player,
      input.game,
      input.category,
      input.timeSeconds,
      proofHash
    );
    const receipt = await tx.wait();

    const metadata = await RunMetadata.create({
      proofHash,
      player: input.player,
      game: input.game,
      category: input.category,
      timeSeconds: input.timeSeconds,
      videoType: req.file ? "file" : "url",
      videoPath: storedVideoPath,
      videoUrl: req.file ? null : input.videoUrl,
      videoOriginalName: req.file?.originalname || null,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      contractAddress: getContractAddress()
    });

    return res.status(201).json({
      message: "Run submitted and verified on the local blockchain.",
      transactionHash: receipt.hash,
      proofHash,
      blockNumber: receipt.blockNumber,
      run: metadata
    });
  } catch (error) {
    if (req.file) {
      fs.promises.unlink(req.file.path).catch(() => {});
    }

    if (error?.code === "CALL_EXCEPTION") {
      error.statusCode = 409;
      error.message =
        error.reason || error.shortMessage || "Smart contract rejected the run.";
    }

    next(error);
  }
});

router.get("/runs", async (_req, res, next) => {
  try {
    const provider = createProvider();
    const latestBlockNumber = await provider.getBlockNumber();
    const latestBlock = await provider.getBlock(latestBlockNumber);
    const runs = await getMergedRuns();

    res.json({
      network: {
        chainId: Number(process.env.CHAIN_ID || 31337),
        latestBlockNumber,
        latestBlockTimestamp: latestBlock?.timestamp || null,
        contractAddress: getContractAddress()
      },
      runs
    });
  } catch (error) {
    next(error);
  }
});

router.get("/events", async (req, res, next) => {
  try {
    const contract = createReadOnlyContract();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const onRunSubmitted = async (
      runId,
      player,
      game,
      category,
      timeSeconds,
      proofHash,
      timestamp,
      event
    ) => {
      const payload = {
        runId: Number(runId),
        player,
        game,
        category,
        timeSeconds: Number(timeSeconds),
        proofHash,
        timestamp: Number(timestamp),
        blockNumber: event.log.blockNumber,
        transactionHash: event.log.transactionHash
      };
      res.write(`event: run-submitted\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    contract.on("RunSubmitted", onRunSubmitted);
    res.write(`event: connected\ndata: {"ok":true}\n\n`);

    req.on("close", () => {
      contract.off("RunSubmitted", onRunSubmitted);
      res.end();
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
