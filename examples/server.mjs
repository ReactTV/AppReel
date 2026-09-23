// A trivial, zero-dependency demo page + a tiny bit of shared state, so the
// example flows have something to record without depending on a real app.
//
// Why a server at all, and not BroadcastChannel/localStorage between two
// pages: each recorded screen runs in its own Playwright browser context,
// and contexts are storage-isolated by design (same reason this project
// needs separate contexts for "one signed-in, one anonymous" scenarios) —
// two contexts can't see each other's BroadcastChannel or localStorage even
// on the same origin. A real network request isn't affected by that
// isolation, so both screens polling/posting to one small HTTP server is
// the correct zero-dependency way to make two recorded screens look synced.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = fs.readFileSync(path.join(__dirname, "index.html"));

export function startDemoServer() {
  let value = "";
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(indexHtml);
        return;
      }
      if (req.method === "GET" && req.url === "/state") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ value }));
        return;
      }
      if (req.method === "POST" && req.url === "/state") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            value = JSON.parse(body).value ?? "";
          } catch {
            // ignore malformed bodies, keep the last good value
          }
          res.writeHead(204);
          res.end();
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
