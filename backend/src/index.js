require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const morgan = require("morgan");
const path = require("path");
const runsRouter = require("./routes/runs");
const seedDemoMetadata = require("./seedDemoMetadata");

const app = express();
const port = Number(process.env.PORT || 5000);
const backendRoot = path.resolve(__dirname, "..");
const configuredUploadDir = process.env.UPLOAD_DIR || "uploads";
const uploadDir = path.isAbsolute(configuredUploadDir)
  ? configuredUploadDir
  : path.resolve(backendRoot, configuredUploadDir);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173"
  })
);
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadDir));
app.use("/api", runsRouter);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "speedrun-verification-backend"
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
  const seeded = await seedDemoMetadata();
  if (seeded > 0) {
    console.log(`Seeded ${seeded} demo metadata records.`);
  }

  app.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start backend:", error.message);
  process.exitCode = 1;
});
