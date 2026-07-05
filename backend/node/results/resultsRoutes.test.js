"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const express = require("express");

const { SqliteResultsRepository } = require("./SqliteResultsRepository");
const { createResultsRouter } = require("./resultsRoutes");

// Spin up a real HTTP server backed by a temp SQLite file, exercise it with
// fetch, then tear everything down.
async function withServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "results-api-"));
  const dbPath = path.join(dir, "test.db");
  const repo = new SqliteResultsRepository(dbPath);

  const app = express();
  app.use("/api", createResultsRouter(repo));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    repo.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const post = (base, body) =>
  fetch(`${base}/api/results`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const voice = (over = {}) => ({
  type: "VOICE",
  name: "Voice Test",
  riskScore: 0.5,
  riskLevel: "Medium",
  ...over,
});

test("POST /api/results stores and echoes a record with id + default userId", () =>
  withServer(async (base) => {
    const res = await post(base, voice({ riskScore: 0.7, riskLevel: "High" }));
    assert.equal(res.status, 201);
    const saved = await res.json();
    assert.ok(saved.id, "should assign an id");
    assert.equal(saved.userId, "local-user");
    assert.equal(saved.riskScore, 0.7);
  }));

test("POST /api/results rejects invalid payloads with 400", () =>
  withServer(async (base) => {
    const bad = await post(base, voice({ riskScore: 5 })); // out of [0,1]
    assert.equal(bad.status, 400);
    const badType = await post(base, voice({ type: "NOPE" }));
    assert.equal(badType.status, 400);
  }));

test("GET /api/results returns saved records, filterable by modality", () =>
  withServer(async (base) => {
    await post(base, voice({ timestamp: 100 }));
    await post(base, voice({ type: "FACE", riskScore: 0.1, riskLevel: "Low", timestamp: 200 }));

    const all = await (await fetch(`${base}/api/results`)).json();
    assert.equal(all.length, 2);
    assert.equal(all[0].timestamp, 200, "newest first");

    const faces = await (await fetch(`${base}/api/results?modality=FACE`)).json();
    assert.equal(faces.length, 1);
    assert.equal(faces[0].type, "FACE");
  }));

test("GET /api/results filters by date range", () =>
  withServer(async (base) => {
    await post(base, voice({ timestamp: 100 }));
    await post(base, voice({ timestamp: 500 }));
    const res = await fetch(`${base}/api/results?from=200&to=600`);
    const list = await res.json();
    assert.equal(list.length, 1);
    assert.equal(list[0].timestamp, 500);
  }));

test("GET /api/overall-risk fuses with within-modality-first weighting", () =>
  withServer(async (base) => {
    // 5 high voice + 1 low face. Fusion must NOT let voice frequency dominate:
    // voice avg 0.9 (weight 0.5/0.8), face avg 0.1 (weight 0.3/0.8) => 0.6.
    for (let i = 0; i < 5; i++) {
      await post(base, voice({ riskScore: 0.9, riskLevel: "High", timestamp: 1000 + i }));
    }
    await post(base, voice({ type: "FACE", riskScore: 0.1, riskLevel: "Low", timestamp: 2000 }));

    const overall = await (await fetch(`${base}/api/overall-risk`)).json();
    assert.ok(Math.abs(overall.overallScore - 0.6) < 1e-9, `got ${overall.overallScore}`);
    assert.equal(overall.riskLevel, "Medium");
    assert.equal(overall.breakdown.voice.count, 5);
    assert.equal(overall.breakdown.face.count, 1);
    // Contribution reflects confidence weight, not test frequency.
    assert.equal(overall.breakdown.voice.contribution, 63); // round(0.625*100)
    assert.equal(overall.breakdown.face.contribution, 37); // round(0.37499..*100) -> 37 (float)
  }));

test("GET /api/overall-risk honors the days window", () =>
  withServer(async (base) => {
    const now = Date.now();
    await post(base, voice({ riskScore: 0.9, riskLevel: "High", timestamp: now })); // recent
    await post(base, voice({
      riskScore: 0.1,
      riskLevel: "Low",
      timestamp: now - 30 * 24 * 60 * 60 * 1000, // 30 days ago
    }));

    const overall = await (await fetch(`${base}/api/overall-risk?days=7`)).json();
    // Only the recent 0.9 voice test is in-window.
    assert.ok(Math.abs(overall.overallScore - 0.9) < 1e-9, `got ${overall.overallScore}`);
    assert.equal(overall.breakdown.voice.count, 1);
  }));
