// Unit + integration tests for the optional sync backend (backend/server.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { handle, normalizeInvite } from "../backend/server.js";

test("normalizeInvite validates e-mail and defaults role/status", () => {
  const inv = normalizeInvite({ email: " Anna@Example.COM " });
  assert.equal(inv.email, "anna@example.com");
  assert.equal(inv.role, "viewer");
  assert.equal(inv.status, "pending");
  assert.throws(() => normalizeInvite({ email: "not-an-email" }), /invalid email/);
});

test("normalizeInvite clamps message length and keeps provided id", () => {
  const inv = normalizeInvite({ email: "a@b.de", id: "fixed-id", message: "x".repeat(900), role: "admin" });
  assert.equal(inv.id, "fixed-id");
  assert.equal(inv.role, "admin");
  assert.equal(inv.message.length, 500);
});

// --- HTTP integration -------------------------------------------------------
const dataDir = mkdtempSync(path.join(os.tmpdir(), "gogure-do-test-"));
process.env.DATA_DIR = dataDir; // read by server.js at import time? No — it reads env at module load.
// server.js captured DATA_DIR at import; instead we drive `handle` with a local
// file store by pointing env before import is impossible here, so we re-import:
const { handle: h2 } = await import("../backend/server.js?" + Date.now());

function request(server, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { port: server.address().port, path: urlPath, method },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, json: data ? JSON.parse(data) : null }));
      }
    );
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

test("API: health, invite CRUD, duplicate rejection, workspace PUT/GET/DELETE", async () => {
  const server = http.createServer(h2);
  await new Promise((r) => server.listen(0, r));
  try {
    const health = await request(server, "GET", "/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.json.ok, true);

    const created = await request(server, "POST", "/api/invites", { email: "tom@example.com", role: "editor" });
    assert.equal(created.status, 201);
    assert.equal(created.json.email, "tom@example.com");

    const dup = await request(server, "POST", "/api/invites", { email: "tom@example.com" });
    assert.equal(dup.status, 409);

    const bad = await request(server, "POST", "/api/invites", { email: "nope" });
    assert.equal(bad.status, 400);

    const patched = await request(server, "PATCH", "/api/invites/" + created.json.id, { status: "accepted" });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.status, "accepted");

    const list = await request(server, "GET", "/api/invites");
    assert.equal(list.json.length, 1);

    const removed = await request(server, "DELETE", "/api/invites/" + created.json.id);
    assert.equal(removed.status, 200);
    assert.equal((await request(server, "GET", "/api/invites")).json.length, 0);

    const put = await request(server, "PUT", "/api/workspace", { tasks: [{ title: "synced" }] });
    assert.equal(put.status, 200);
    const got = await request(server, "GET", "/api/workspace");
    assert.equal(got.json.tasks[0].title, "synced");
    assert.ok(got.json.syncedAt);

    await request(server, "DELETE", "/api/workspace");
    const cleared = await request(server, "GET", "/api/workspace");
    assert.deepEqual(cleared.json, {});

    const missing = await request(server, "GET", "/api/nope");
    assert.equal(missing.status, 404);
  } finally {
    server.close();
  }
});
