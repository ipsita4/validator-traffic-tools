const fs = require("fs");
const readline = require("readline");

const IN = process.argv[2] || "tx_traffic.csv";
const OUT = process.argv[3] || "tx_traffic_4types.csv";

const KEEP = new Set(["merge", "marker", "dar", "transfer"]);

async function run() {
  if (!fs.existsSync(IN)) throw new Error(`Missing input CSV: ${IN}`);

  const rl = readline.createInterface({
    input: fs.createReadStream(IN, "utf8"),
    crlfDelay: Infinity
  });

  const out = fs.createWriteStream(OUT, { encoding: "utf8" });

  let header = null;
  let txTypeIdx = -1;
  let kept = 0;
  let seen = 0;

  for await (const line of rl) {
    const raw = line.trimEnd();
    if (!raw) continue;

    if (!header) {
      header = raw.split(",");
      txTypeIdx = header.indexOf("tx_type");
      if (txTypeIdx === -1) throw new Error(`Input CSV missing tx_type column: ${IN}`);
      out.write(`${raw}\n`);
      continue;
    }

    seen += 1;
    const cols = raw.split(",");
    const t = String(cols[txTypeIdx] || "").trim();
    if (!KEEP.has(t)) continue;
    out.write(`${raw}\n`);
    kept += 1;
  }

  out.end();
  console.log(`✅ Wrote ${OUT} (kept ${kept}/${seen} rows)`);
}

run().catch((e) => {
  console.error("❌", e?.message || e);
  process.exitCode = 1;
});

