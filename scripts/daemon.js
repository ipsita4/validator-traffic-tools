const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { startDashboard } = require("./dashboard_server");
const { trimCsvToLastNRows } = require("./trim_csv");

const ROOT = path.join(__dirname, "..");

const DASHBOARD_PORT = Number(process.env.PORT || process.env.DASHBOARD_PORT || 8080);
const REFRESH_SECONDS = Number(process.env.REFRESH_SECONDS || 300);
const MAX_ROWS = Number(process.env.MAX_ROWS || 500);

const FILES_TO_TRIM = [
  path.join(ROOT, "tx_traffic.csv"),
  path.join(ROOT, "tx_traffic_4types.csv"),
  path.join(ROOT, "tx_kb_data.csv")
];

function runNode(scriptRelPath, args = []) {
  return new Promise((resolve, reject) => {
    const scriptAbs = path.join(ROOT, scriptRelPath);
    const child = spawn(process.execPath, [scriptAbs, ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit"
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptRelPath} exited with ${code}`));
    });
    child.on("error", reject);
  });
}

function safeUnlink(p) {
  try {
    fs.unlinkSync(p);
  } catch {}
}

async function refreshOnce() {
  // Overwrite each refresh to keep things deterministic.
  safeUnlink(path.join(ROOT, "tx_data.jsonl"));
  safeUnlink(path.join(ROOT, "tx_traffic.csv"));
  safeUnlink(path.join(ROOT, "tx_traffic_4types.csv"));
  safeUnlink(path.join(ROOT, "tx_kb_data.csv"));

  await runNode("scripts/fetch_tx_traffic.js");
  await runNode("scripts/filter_4types_csv.js", ["tx_traffic.csv", "tx_traffic_4types.csv"]);

  for (const f of FILES_TO_TRIM) {
    await trimCsvToLastNRows(f, MAX_ROWS);
  }
}

async function main() {
  console.log(`[daemon] dashboard port=${DASHBOARD_PORT}`);
  console.log(`[daemon] refresh every ${REFRESH_SECONDS}s, keep last ${MAX_ROWS} rows`);

  startDashboard({ port: DASHBOARD_PORT, fallbackTries: 0 });

  // Initial refresh then schedule.
  try {
    await refreshOnce();
  } catch (e) {
    console.error("[daemon] initial refresh failed:", e?.message || e);
  }

  setInterval(async () => {
    try {
      await refreshOnce();
    } catch (e) {
      console.error("[daemon] refresh failed:", e?.message || e);
    }
  }, REFRESH_SECONDS * 1000);
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exitCode = 1;
});

