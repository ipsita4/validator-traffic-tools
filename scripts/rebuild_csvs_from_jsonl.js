const fs = require("fs");
const readline = require("readline");

const IN = process.argv[2] || "tx_data.jsonl";
const OUT_KB = process.argv[3] || "tx_kb_data.csv";
const OUT_TRAFFIC = process.argv[4] || "tx_traffic.csv";

async function run() {
  if (!fs.existsSync(IN)) throw new Error(`Missing ${IN}`);

  const rl = readline.createInterface({
    input: fs.createReadStream(IN, "utf8"),
    crlfDelay: Infinity
  });

  const kb = fs.createWriteStream(OUT_KB, { encoding: "utf8" });
  const tr = fs.createWriteStream(OUT_TRAFFIC, { encoding: "utf8" });

  kb.write("update_id,tx_type,effective_at,fetched_at,response_kb,request_kb,base_kb\n");
  tr.write(
    "update_id,tx_type,effective_at,fetched_at,request_body_kb,response_body_kb,request_headers_kb,response_headers_kb,base_kb,extra_kb,total_kb\n"
  );

  let rows = 0;
  for await (const line of rl) {
    const s = line.trim();
    if (!s) continue;
    let rec;
    try {
      rec = JSON.parse(s);
    } catch {
      continue;
    }

    const updateId = rec.updateId || "";
    const txType = rec.txType || "unknown";
    const effectiveAt = rec.effectiveAt || rec?.transaction?.transaction?.effectiveAt || "";
    const fetchedAt = rec.fetchedAt || "";

    const reqBody = Number(rec.requestBodyBytes ?? rec.requestBytes ?? 0);
    const resBody = Number(rec.responseBodyBytes ?? rec.responseBytes ?? 0);
    const reqHdr = Number(rec.requestHeaderBytes ?? 0);
    const resHdr = Number(rec.responseHeaderBytes ?? 0);
    const base = Number(rec.baseBytes ?? reqBody + resBody);
    const extra = Number(rec.extraBytes ?? reqHdr + resHdr);
    const total = Number(rec.totalBytes ?? base + extra);

    kb.write(
      `${updateId},${txType},${effectiveAt},${fetchedAt},${(resBody / 1024).toFixed(2)},${(
        reqBody / 1024
      ).toFixed(2)},${(base / 1024).toFixed(2)}\n`
    );

    tr.write(
      `${updateId},${txType},${effectiveAt},${fetchedAt},${(reqBody / 1024).toFixed(2)},${(
        resBody / 1024
      ).toFixed(2)},${(reqHdr / 1024).toFixed(2)},${(resHdr / 1024).toFixed(2)},${(
        base / 1024
      ).toFixed(2)},${(extra / 1024).toFixed(2)},${(total / 1024).toFixed(2)}\n`
    );

    rows += 1;
  }

  kb.end();
  tr.end();
  console.log(`✅ Rebuilt CSVs with timestamps (${rows} rows)`);
}

run().catch((e) => {
  console.error("❌", e?.message || e);
  process.exitCode = 1;
});

