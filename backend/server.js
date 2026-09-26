#!/usr/bin/env node
// Gogure Do — Optional sync backend (zero-dependency Node.js, >= 18)
//
// Purpose: lets a user who *explicitly enables it* in Settings sync their
// invites and workspace snapshot to their own self-hosted server (e.g. a
// home-server or EU VPS). The app is local-first: this backend is never
// contacted unless the user saves a backend URL in the settings view.
//
// GDPR / DSGVO notes (see docs/PRIVACY.md):
//   - Only two data categories are accepted: e-mail addresses of invitees
//     (Art. 6(1)(b)/(f)) and an opaque workspace JSON blob owned by the user.
//   - No analytics, no cookies, no third parties, no logging of request bodies.
//   - Data deletion: DELETE endpoints below, or simply remove the data dir.
//
// Run:  node backend/server.js          (default port 8787, override: PORT=)
// Docker-friendly: stores JSON files under DATA_DIR (default ./backend/data).

import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const INVITES_FILE = path.join(DATA_DIR, "invites.json");
const WORKSPACE_FILE = path.join(DATA_DIR, "workspace.json");
// Shared secret; empty string disables auth (NOT recommended for public hosts).
const API_TOKEN = process.env.GOGURE_DO_TOKEN || "";
const MAX_BODY = 2 * 1024 * 1024; // 2 MB hard limit (data minimisation)

const VALID_ROLES = ["viewer", "editor", "admin"];
const VALID_STATUS = ["pending", "accepted", "revoked"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ------------------------------------------------------------------ storage
async function ensureStore() {
  await mkdir(DATA_DIR, { recursive: true });
  for (const f of [INVITES_FILE, WORKSPACE_FILE]) {
    try { await readFile(f, "utf8"); }
    catch { await writeFile(f, f === INVITES_FILE ? "[]" : "{}", "utf8"); }
  }
}
async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
async function writeJson(file, value) {
  // Atomic-ish write: temp file + rename avoids corruption on crash.
  const tmp = file + ".tmp-" + crypto.randomBytes(4).toString("hex");
  await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await import("node:fs").then((fs) => fs.promises.rename(tmp, file));
}

// ------------------------------------------------------------------ helpers
function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    // Same-origin usage only; adjust CORS deliberately when hosting remotely.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("payload too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new Error("invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function authorized(req) {
  if (!API_TOKEN) return true; // auth disabled (local-only setups)
  const h = req.headers.authorization || "";
  return h === "Bearer " + API_TOKEN;
}

/** Normalise + validate one invite record. Throws Error with a 4xx message. */
export function normalizeInvite(raw, now = new Date().toISOString()) {
  const email = String(raw?.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw Object.assign(new Error("invalid email"), { status: 400 });
  const role = VALID_ROLES.includes(raw?.role) ? raw.role : "viewer";
  const status = VALID_STATUS.includes(raw?.status) ? raw.status : "pending";
  return {
    id: String(raw?.id || crypto.randomUUID()),
    email,
    role,
    status,
    message: String(raw?.message || "").slice(0, 500),
    createdAt: String(raw?.createdAt || now),
    updatedAt: now,
  };
}

// ------------------------------------------------------------------- router
export async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean); // e.g. ["api","invites",":id"]

  if (req.method === "OPTIONS") return send(res, 204, {});
  if (!authorized(req)) return send(res, 401, { error: "unauthorized" });

  // GET /api/health — liveness probe (no personal data).
  if (req.method === "GET" && url.pathname === "/api/health") {
    return send(res, 200, { ok: true, service: "gogure-do-backend", time: new Date().toISOString() });
  }

  // ---- Invites --------------------------------------------------------------
  if (parts[0] === "api" && parts[1] === "invites") {
    const invites = await readJson(INVITES_FILE);
    const id = parts[2];

    if (req.method === "GET" && !id) return send(res, 200, invites);

    if (req.method === "POST" && !id) {
      const inv = normalizeInvite(await readBody(req));
      if (invites.some((i) => i.email === inv.email)) {
        return send(res, 409, { error: "invite already exists" });
      }
      invites.push(inv);
      await writeJson(INVITES_FILE, invites);
      return send(res, 201, inv);
    }

    const idx = invites.findIndex((i) => i.id === id);
    if (idx === -1) return send(res, 404, { error: "not found" });

    if (req.method === "PATCH") {
      const patch = await readBody(req);
      const merged = normalizeInvite({ ...invites[idx], ...patch, id }, new Date().toISOString());
      invites[idx] = merged;
      await writeJson(INVITES_FILE, invites);
      return send(res, 200, merged);
    }
    if (req.method === "DELETE") {
      const [removed] = invites.splice(idx, 1);
      await writeJson(INVITES_FILE, invites);
      return send(res, 200, removed);
    }
  }

  // ---- Workspace snapshot (single-user sync) --------------------------------
  if (parts[0] === "api" && parts[1] === "workspace") {
    if (req.method === "GET") return send(res, 200, await readJson(WORKSPACE_FILE));
    if (req.method === "PUT") {
      const body = await readBody(req);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return send(res, 400, { error: "expected object" });
      }
      await writeJson(WORKSPACE_FILE, { ...body, syncedAt: new Date().toISOString() });
      return send(res, 200, { ok: true });
    }
    if (req.method === "DELETE") {
      await writeJson(WORKSPACE_FILE, {}); // right-to-erasure (DSGVO Art. 17)
      return send(res, 200, { ok: true });
    }
  }

  return send(res, 404, { error: "not found" });
}

// --------------------------------------------------------------- entrypoint
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await ensureStore();
  http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      const status = err.status || (/too large|invalid JSON/.test(err.message) ? 400 : 500);
      send(res, status, { error: err.message });
    });
  }).listen(PORT, () => console.log(`Gogure Do backend listening on http://localhost:${PORT}`));
}
