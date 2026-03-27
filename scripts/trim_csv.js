const fs = require("fs");
const readline = require("readline");

async function trimCsvToLastNRows(filePath, maxRows) {
  if (!fs.existsSync(filePath)) return { trimmed: false, rowsKept: 0 };

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, "utf8"),
    crlfDelay: Infinity
  });

  let header = null;
  const buffer = [];
  for await (const line of rl) {
    const raw = line.trimEnd();
    if (!raw) continue;
    if (!header) {
      header = raw;
      continue;
    }
    buffer.push(raw);
    if (buffer.length > maxRows) buffer.shift();
  }

  if (!header) return { trimmed: false, rowsKept: 0 };
  const out = [header, ...buffer].join("\n") + "\n";
  fs.writeFileSync(filePath, out, "utf8");
  return { trimmed: true, rowsKept: buffer.length };
}

async function main() {
  const filePath = process.argv[2];
  const maxRows = Number(process.argv[3] || 500);
  if (!filePath) throw new Error("Usage: node scripts/trim_csv.js <file> [maxRows]");
  await trimCsvToLastNRows(filePath, maxRows);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("❌", e?.message || e);
    process.exitCode = 1;
  });
}

module.exports = { trimCsvToLastNRows };

