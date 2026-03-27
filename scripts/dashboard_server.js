const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DASHBOARD_DIR = path.join(ROOT, "dashboard");
const DEFAULT_PORT = 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8"
};

function send(res, code, body, type = "text/plain; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type });
  res.end(body);
}

function safeJoin(base, relPath) {
  const p = path.normalize(path.join(base, relPath));
  if (!p.startsWith(base)) return null;
  return p;
}

function createServer() {
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);

    if (urlPath === "/" || urlPath === "/dashboard") {
      const idx = path.join(DASHBOARD_DIR, "index.html");
      const html = fs.readFileSync(idx, "utf8");
      return send(res, 200, html, MIME[".html"]);
    }

    let filePath = null;
    if (urlPath.startsWith("/dashboard/")) {
      filePath = safeJoin(DASHBOARD_DIR, urlPath.replace("/dashboard/", ""));
    } else {
      // Expose output files from project root (tx_traffic.csv, tx_traffic_4types.csv, ...)
      filePath = safeJoin(ROOT, urlPath.replace(/^\//, ""));
    }

    if (!filePath) return send(res, 403, "Forbidden");
    if (!fs.existsSync(filePath)) return send(res, 404, "Not found");
    if (!fs.statSync(filePath).isFile()) return send(res, 404, "Not found");

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(data);
  });
}

function startDashboard({ port = DEFAULT_PORT, host = "0.0.0.0", fallbackTries = 20 } = {}) {
  function listenWithFallback(p, remainingTries) {
    const server = createServer();
    server.once("error", (err) => {
      if (err && err.code === "EADDRINUSE" && remainingTries > 0) {
        console.warn(`Port ${p} is in use, trying ${p + 1}...`);
        return listenWithFallback(p + 1, remainingTries - 1);
      }
      throw err;
    });

    server.listen(p, host, () => {
      console.log(`Dashboard running at http://localhost:${p}/dashboard`);
    });
  }

  listenWithFallback(port, fallbackTries);
}

module.exports = { startDashboard };

if (require.main === module) {
  const port = Number(process.env.DASHBOARD_PORT || DEFAULT_PORT);
  startDashboard({ port });
}

