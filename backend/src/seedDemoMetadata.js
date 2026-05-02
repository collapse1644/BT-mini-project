require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const RunMetadata = require("./models/RunMetadata");

async function seedDemoMetadata() {
  const demoPath = path.join(__dirname, "config", "demo-runs.json");
  if (!fs.existsSync(demoPath)) {
    return 0;
  }

  const records = JSON.parse(fs.readFileSync(demoPath, "utf8"));
  let seeded = 0;

  for (const record of records) {
    const result = await RunMetadata.updateOne(
      { proofHash: record.proofHash.toLowerCase() },
      { $setOnInsert: record },
      { upsert: true }
    );
    if (result.upsertedCount > 0) {
      seeded += 1;
    }
  }

  return seeded;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const seeded = await seedDemoMetadata();
  console.log(`Demo metadata records inserted: ${seeded}`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
}

module.exports = seedDemoMetadata;
