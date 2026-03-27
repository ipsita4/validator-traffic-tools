const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const axios = require("axios");
const { getToken } = require("./auth0Token");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const LEDGER_URL = process.env.LEDGER_URL || "http://34.41.232.35:7575/api/json-api";
const PARTY = process.env.PARTY;

const OUTPUT_DIR = process.env.OUTPUT_DIR
  ? path.resolve(path.join(__dirname, "..", process.env.OUTPUT_DIR))
  : path.join(__dirname, "..");

const OUTPUT_KB = path.join(OUTPUT_DIR, "tx_kb_data.csv");
const OUTPUT_TRAFFIC = path.join(OUTPUT_DIR, "tx_traffic.csv");
const OUTPUT_JSONL = path.join(OUTPUT_DIR, "tx_data.jsonl");

const CONCURRENCY = Number(process.env.CONCURRENCY || 5);
const DELAY_MS = Number(process.env.DELAY_MS || 50);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureHeader(filePath, header) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, `${header}\n`, "utf8");
}

function buildPartyFilter(party) {
  return {
    filtersByParty: {
      [party]: {
        cumulative: [
          {
            identifierFilter: {
              WildcardFilter: { value: { includeCreatedEventBlob: false } }
            }
          }
        ]
      }
    }
  };
}

function approxHeaderBytes(headersObj) {
  if (!headersObj) return 0;
  let bytes = 0;
  for (const [k, v] of Object.entries(headersObj)) {
    if (v === undefined || v === null) continue;
    const vs = Array.isArray(v) ? v.join(", ") : String(v);
    bytes += Buffer.byteLength(`${k}: ${vs}\r\n`);
  }
  bytes += 2;
  return bytes;
}

function approxResponseHeaderBytes(fetchHeaders) {
  if (!fetchHeaders) return 0;
  let bytes = 0;
  for (const [k, v] of fetchHeaders.entries()) bytes += Buffer.byteLength(`${k}: ${v}\r\n`);
  bytes += 2;
  return bytes;
}

function extractTemplateIdsFromTx(tx) {
  const evs = tx?.events || [];
  const out = [];
  for (const ev of evs) {
    const e = ev?.CreatedEvent || ev?.ArchivedEvent || ev?.ExercisedEvent;
    if (e?.templateId) out.push(e.templateId);
  }
  return out;
}

function classifyTxType(templateIds) {
  const s = templateIds.join(" | ");

  if (s.includes("Splice.Amulet:AppRewardCoupon")) return "reward_coupon";
  if (s.includes("Splice.Amulet:ValidatorRewardCoupon")) return "validator_reward_coupon";
  if (s.includes("Splice.ValidatorLicense:ValidatorLivenessActivityRecord"))
    return "validator_liveness";
  if (s.includes("Splice.ValidatorLicense:ValidatorLicense")) return "validator_license";
  if (s.includes("Splice.Amulet:ValidatorRight")) return "validator_right";

  if (s.includes("Splice.Amulet:FeaturedAppActivityMarker")) return "marker";

  if (
    s.includes(":OptionToken:") ||
    s.includes(":Series:") ||
    s.includes(":Vault:") ||
    s.includes("PositionLot") ||
    s.includes("ActivityAudit")
  ) {
    return "dar";
  }

  if (s.includes("TransferPreapproval") || s.includes("Splice.Wallet")) return "transfer";
  if (s.includes("Splice.Amulet:Amulet") || s.includes("Splice.AmuletRules")) return "merge";

  return "unknown";
}

async function fetchTxById(updateId, token) {
  const body = JSON.stringify({ updateId, requestingParties: [PARTY] });
  const reqBodyBytes = Buffer.byteLength(body);
  const reqHeadersObj = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const reqHeaderBytes = approxHeaderBytes(reqHeadersObj);

  const res = await fetch(`${LEDGER_URL}/v2/updates/transaction-by-id`, {
    method: "POST",
    headers: reqHeadersObj,
    body
  });

  const resText = await res.text();
  if (!res.ok) {
    const err = new Error(`transaction-by-id failed: ${res.status}`);
    err.status = res.status;
    err.body = resText;
    throw err;
  }

  const resBodyBytes = Buffer.byteLength(resText);
  const resHeaderBytes = approxResponseHeaderBytes(res.headers);

  let parsed = null;
  try {
    parsed = JSON.parse(resText);
  } catch {
    parsed = null;
  }

  const tx = parsed?.transaction || parsed?.Transaction || null;
  const effectiveAt = tx?.effectiveAt || "";
  const templateIds = extractTemplateIdsFromTx(tx);
  const txType = classifyTxType(templateIds);

  const baseBytes = reqBodyBytes + resBodyBytes;
  const extraBytes = reqHeaderBytes + resHeaderBytes;
  const totalBytes = baseBytes + extraBytes;

  return {
    updateId,
    txType,
    effectiveAt,
    templateIds,
    requestBodyBytes: reqBodyBytes,
    responseBodyBytes: resBodyBytes,
    requestHeaderBytes: reqHeaderBytes,
    responseHeaderBytes: resHeaderBytes,
    baseBytes,
    extraBytes,
    totalBytes,
    fetchedAt: new Date().toISOString(),
    transaction: parsed,
    rawText: parsed ? undefined : resText
  };
}

async function processQueue(queue, doneRef, token, kbCsv, trafficCsv, jsonl) {
  const workers = [];

  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(
      (async () => {
        while (true) {
          const id = queue.shift();
          if (!id) {
            if (doneRef.value) return;
            await sleep(25);
            continue;
          }

          try {
            const rec = await fetchTxById(id, token);
            jsonl.write(`${JSON.stringify(rec)}\n`);

            kbCsv.write(
              `${rec.updateId},${rec.txType},${rec.effectiveAt},${rec.fetchedAt},${(
                rec.responseBodyBytes / 1024
              ).toFixed(2)},${(
                rec.requestBodyBytes / 1024
              ).toFixed(2)},${(rec.baseBytes / 1024).toFixed(2)}\n`
            );

            trafficCsv.write(
              `${rec.updateId},${rec.txType},${rec.effectiveAt},${rec.fetchedAt},${(
                rec.requestBodyBytes / 1024
              ).toFixed(2)},${(
                rec.responseBodyBytes / 1024
              ).toFixed(2)},${(rec.requestHeaderBytes / 1024).toFixed(2)},${(
                rec.responseHeaderBytes / 1024
              ).toFixed(2)},${(rec.baseBytes / 1024).toFixed(2)},${(rec.extraBytes / 1024).toFixed(
                2
              )},${(rec.totalBytes / 1024).toFixed(2)}\n`
            );

            await sleep(DELAY_MS);
          } catch (e) {
            // keep going; missing txs happen (404)
          }
        }
      })()
    );
  }

  await Promise.all(workers);
}

async function run() {
  if (!PARTY) throw new Error("Missing PARTY in .env");

  ensureHeader(OUTPUT_KB, "update_id,tx_type,effective_at,fetched_at,response_kb,request_kb,base_kb");
  ensureHeader(
    OUTPUT_TRAFFIC,
    "update_id,tx_type,effective_at,fetched_at,request_body_kb,response_body_kb,request_headers_kb,response_headers_kb,base_kb,extra_kb,total_kb"
  );

  const kbCsv = fs.createWriteStream(OUTPUT_KB, { flags: "a" });
  const trafficCsv = fs.createWriteStream(OUTPUT_TRAFFIC, { flags: "a" });
  const jsonl = fs.createWriteStream(OUTPUT_JSONL, { flags: "a" });

  const token = await getToken();
  const endRes = await axios.get(`${LEDGER_URL}/v2/state/ledger-end`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20_000
  });
  const ledgerEnd = Number(endRes.data?.offset ?? 0);
  if (!Number.isFinite(ledgerEnd)) throw new Error("Unexpected ledger-end response");

  let beginExclusive = process.env.INDEXER_BEGIN_EXCLUSIVE
    ? Number(process.env.INDEXER_BEGIN_EXCLUSIVE)
    : 0;

  if (!process.env.INDEXER_BEGIN_EXCLUSIVE) {
    const backlog = Number(process.env.INDEXER_TIP_BACKLOG || 5_000);
    const safeBacklog = Number.isFinite(backlog) ? Math.max(1, backlog) : 5_000;
    beginExclusive = Math.max(0, ledgerEnd - safeBacklog);
  }

  const queue = [];
  const doneRef = { value: false };
  const processing = processQueue(queue, doneRef, token, kbCsv, trafficCsv, jsonl);

  let windowSize = 100;
  const filter = buildPartyFilter(PARTY);

  while (beginExclusive < ledgerEnd) {
    const endInclusive = Math.min(ledgerEnd, beginExclusive + windowSize);
    const body = { beginExclusive, endInclusive, filter, verbose: true };

    try {
      const updatesRes = await axios.post(`${LEDGER_URL}/v2/updates`, body, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        params: { limit: 200 },
        timeout: 60_000
      });
      const arr = Array.isArray(updatesRes.data) ? updatesRes.data : [];
      for (const item of arr) {
        const update = item?.update ?? item;
        const updateId =
          update?.Transaction?.value?.updateId ||
          update?.Transaction?.value?.transactionId ||
          update?.Transaction?.updateId ||
          update?.Transaction?.transactionId ||
          update?.updateId ||
          update?.transactionId ||
          null;
        if (updateId) queue.push(updateId);
      }

      beginExclusive = endInclusive;
      if (windowSize < 200) windowSize = Math.min(200, windowSize + 25);
    } catch (e) {
      const status = e?.response?.status;
      const text =
        typeof e?.response?.data === "string" ? e.response.data : JSON.stringify(e?.response?.data || {});
      if (status === 413 || text.includes("MAXIMUM_LIST_ELEMENTS_NUMBER_REACHED")) {
        windowSize = Math.max(1, Math.floor(windowSize / 2));
        await sleep(500);
        continue;
      }
      throw e;
    }
  }

  doneRef.value = true;
  await processing;
  kbCsv.end();
  trafficCsv.end();
  jsonl.end();
}

run().catch((e) => {
  console.error("❌", e?.message || e);
  process.exitCode = 1;
});

