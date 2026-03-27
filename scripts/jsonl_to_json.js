const fs = require("fs");
const path = require("path");
const readline = require("readline");

async function jsonlToJsonArray({ inputPath, outputPath }) {
  const input = fs.createReadStream(inputPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  const out = fs.createWriteStream(outputPath, { encoding: "utf8" });
  out.write("[\n");

  let first = true;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!first) out.write(",\n");
    out.write(JSON.stringify(obj));
    first = false;
  }

  out.write("\n]\n");
  await new Promise((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
    out.end();
  });
}

async function main() {
  const root = path.join(__dirname, "..");
  const inputPath = process.argv[2] || path.join(root, "tx_data.jsonl");
  const outputPath = process.argv[3] || path.join(root, "tx_data.json");

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input JSONL not found: ${inputPath}`);
  }

  await jsonlToJsonArray({ inputPath, outputPath });
  console.log(`✅ Wrote JSON array file: ${outputPath}`);
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exitCode = 1;
});

