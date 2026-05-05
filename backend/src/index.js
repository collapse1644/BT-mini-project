require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const morgan = require("morgan");
const path = require("path");
const runsRouter = require("./routes/runs");
const nodeRouter = require("./routes/node");
const nodeBlockchain = require("./services/nodeBlockchainService");

const app = express();
const port = Number(process.env.PORT || 5000);
const backendRoot = path.resolve(__dirname, "..");
const configuredUploadDir = process.env.UPLOAD_DIR || "uploads";
const uploadDir = path.isAbsolute(configuredUploadDir)
  ? configuredUploadDir
  : path.resolve(backendRoot, configuredUploadDir);
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.FRONTEND_URL
].filter(Boolean));

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  })
);
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadDir));

app.post("/api/submit", (req, res) => {
  console.log("Request received:", req.body);
  res.json({ success: true });
});

app.use("/", nodeRouter);
app.use("/api", nodeRouter);
app.use("/api", runsRouter);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "speedrun-verification-backend",
    node: nodeBlockchain.getStatus()
  });
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    message: error.message || "Unexpected server error"
  });
});

async function start() {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000
  });
  console.log("MongoDB connected.");
  await nodeBlockchain.initialize(mongoose.connection);
  console.log(`Blockchain node ready: ${nodeBlockchain.nodeId}`);

  app.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start backend:", error.message);
  process.exitCode = 1;
});
