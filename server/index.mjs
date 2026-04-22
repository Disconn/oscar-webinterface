import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import express from "express";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const OSCAR_API_URL = (process.env.OSCAR_API_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const PORT = Number(process.env.PORT || 3333, 10);
const BASIC_HEADER =
  process.env.OSCAR_BASIC_AUTH && String(process.env.OSCAR_BASIC_AUTH).trim()
    ? `Basic ${Buffer.from(String(process.env.OSCAR_BASIC_AUTH), "utf8").toString("base64")}`
    : null;

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function buildUpstreamHeaders(req) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, val] of Object.entries(req.headers)) {
    if (val === undefined) continue;
    const lk = key.toLowerCase();
    if (HOP_BY_HOP.has(lk)) continue;
    if (lk === "authorization" && BASIC_HEADER) continue;
    out[key] = Array.isArray(val) ? val.join(", ") : val;
  }
  if (BASIC_HEADER) out.Authorization = BASIC_HEADER;
  return out;
}

const app = express();

app.disable("x-powered-by");

app.get("/meta", (_req, res) => {
  res.json({
    oscarApiUrl: OSCAR_API_URL,
    basicAuthConfigured: Boolean(BASIC_HEADER),
  });
});

app.use(
  "/api",
  express.raw({ type: "*/*", limit: "32mb" }),
  async (req, res) => {
    const suffix = req.url || "/";
    const upstream = `${OSCAR_API_URL}${suffix}`;

    /** @type {import('node:buffer').Buffer | undefined} */
    let body;
    if (!["GET", "HEAD"].includes(req.method) && Buffer.isBuffer(req.body) && req.body.length > 0) {
      body = req.body;
    }

    const headers = buildUpstreamHeaders(req);

    try {
      const upstreamRes = await fetch(upstream, {
        method: req.method,
        headers,
        body,
        redirect: "manual",
      });

      res.status(upstreamRes.status);
      upstreamRes.headers.forEach((value, name) => {
        const ln = name.toLowerCase();
        if (ln === "transfer-encoding" || ln === "connection") return;
        res.append(name, value);
      });

      const buf = Buffer.from(await upstreamRes.arrayBuffer());
      res.send(buf);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({
        error: "Management-API nicht erreichbar.",
        detail: message,
        target: OSCAR_API_URL,
      });
    }
  },
);

app.use(express.static(path.join(rootDir, "public"), { extensions: ["html"] }));

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Oscar Webinterface: http://127.0.0.1:${PORT}  →  ${OSCAR_API_URL}`);
});
