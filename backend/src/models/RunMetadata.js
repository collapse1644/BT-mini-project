const mongoose = require("mongoose");

const runMetadataSchema = new mongoose.Schema(
  {
    proofHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    player: {
      type: String,
      required: true,
      trim: true
    },
    game: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      required: true,
      trim: true
    },
    timeSeconds: {
      type: Number,
      required: true,
      min: 1
    },
    videoType: {
      type: String,
      enum: ["file", "url"],
      required: true
    },
    videoPath: {
      type: String,
      default: null
    },
    videoUrl: {
      type: String,
      default: null
    },
    videoOriginalName: {
      type: String,
      default: null
    },
    transactionHash: {
      type: String,
      required: true,
      index: true
    },
    blockNumber: {
      type: Number,
      required: true
    },
    contractAddress: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("RunMetadata", runMetadataSchema);
