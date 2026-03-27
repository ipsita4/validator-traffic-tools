const fs = require("fs");
const readline = require("readline");

const TRAFFIC_IN = process.argv[2] || "tx_traffic.csv";
const OUT = process.argv[3] || "tx_traffic_4types.csv";

const KEEP = new Set(["merge", "marker", "dar", "transfer"]);

async function loadExistingIds(outPath) {
  const ids = new Set();
  if (!fs.existsSync(outPath)) return ids;

  const rl = readline.createInterface({
    input: fs.createReadStream(outPath, "utf8"),
    crlfDelay: Infinity
  });

  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    const t = line.trim();
    if (!t) continue;
    const id = t.split(",")[0];
    if (id) ids.add(id);
  }
  return ids;
}

async function run() {
  if (!fs.existsSync(TRAFFIC_IN)) throw new Error(`Missing input CSV: ${TRAFFIC_IN}`);

  const already = await loadExistingIds(OUT);

  const rl = readline.createInterface({
    input: fs.createReadStream(TRAFFIC_IN, "utf8"),
    crlfDelay: Infinity
  });

  const outExists = fs.existsSync(OUT);
  const out = fs.createWriteStream(OUT, { flags: "a", encoding: "utf8" });

  let header = null;
  let txTypeIdx = -1;
  let appended = 0;
  let scanned = 0;

  for await (const line of rl) {
    const raw = line.trimEnd();
    if (!raw) continue;

    if (!header) {
      header = raw.split(",");
      txTypeIdx = header.indexOf("tx_type");
      if (txTypeIdx === -1) throw new Error(`Input CSV missing tx_type column`);
      if (!outExists) out.write(`${raw}\n`);
      continue;
    }

    scanned += 1;
    const cols = raw.split(",");
    const updateId = cols[0];
    const t = String(cols[txTypeIdx] || "").trim();
    if (!KEEP.has(t)) continue;
    if (already.has(updateId)) continue;

    out.write(`${raw}\n`);
    already.add(updateId);
    appended += 1;
  }

  out.end();
  console.log(`✅ Appended ${appended} new rows (scanned ${scanned})`);
}

run().catch((e) => {
  console.error("❌", e?.message || e);
  process.exitCode = 1;
});

