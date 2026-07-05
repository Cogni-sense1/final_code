"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { SqliteResultsRepository } = require("./SqliteResultsRepository");
const { normalizeResult } = require("./ResultsRepository");

// Each test gets its own temp SQLite file, removed afterward.
function withRepo(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "results-repo-"));
  const dbPath = path.join(dir, "test.db");
  const repo = new SqliteResultsRepository(dbPath);
  return Promise.resolve(fn(repo)).finally(() => {
    repo.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

const make = (over = {}) =>
  normalizeResult({
    type: "VOICE",
    name: "Voice Test",
    riskScore: 0.5,
    riskLevel: "Medium",
    timestamp: 1000,
    userId: "local-user",
    ...over,
  });

test("save then list returns the stored record", () =>
  withRepo(async (repo) => {
    const rec = make({ riskScore: 0.42, metadata: { updrs: 3 } });
    const saved = await repo.save(rec);
    assert.equal(saved.id, rec.id);

    const list = await repo.list({ userId: "local-user" });
    assert.equal(list.length, 1);
    assert.equal(list[0].riskScore, 0.42);
    assert.deepEqual(list[0].metadata, { updrs: 3 });
    assert.equal(list[0].userId, "local-user");
  }));

test("list is ordered by timestamp descending", () =>
  withRepo(async (repo) => {
    await repo.save(make({ timestamp: 100 }));
    await repo.save(make({ timestamp: 300 }));
    await repo.save(make({ timestamp: 200 }));
    const list = await repo.list({ userId: "local-user" });
    assert.deepEqual(
      list.map((r) => r.timestamp),
      [300, 200, 100]
    );
  }));

test("list filters by modality", () =>
  withRepo(async (repo) => {
    await repo.save(make({ type: "VOICE" }));
    await repo.save(make({ type: "FACE", riskLevel: "Low", riskScore: 0.1 }));
    const faces = await repo.list({ userId: "local-user", modality: "FACE" });
    assert.equal(faces.length, 1);
    assert.equal(faces[0].type, "FACE");
  }));

test("list filters by date range (from/to inclusive)", () =>
  withRepo(async (repo) => {
    await repo.save(make({ timestamp: 100 }));
    await repo.save(make({ timestamp: 200 }));
    await repo.save(make({ timestamp: 300 }));
    const mid = await repo.list({ userId: "local-user", from: 150, to: 250 });
    assert.deepEqual(
      mid.map((r) => r.timestamp),
      [200]
    );
  }));

test("records are isolated per userId", () =>
  withRepo(async (repo) => {
    await repo.save(make({ userId: "alice" }));
    await repo.save(make({ userId: "bob" }));
    assert.equal((await repo.list({ userId: "alice" })).length, 1);
    assert.equal((await repo.list({ userId: "bob" })).length, 1);
  }));

test("saving the same id upserts rather than duplicating", () =>
  withRepo(async (repo) => {
    const rec = make({ id: "fixed-id", riskScore: 0.2 });
    await repo.save(rec);
    await repo.save({ ...rec, riskScore: 0.9 });
    const list = await repo.list({ userId: "local-user" });
    assert.equal(list.length, 1);
    assert.equal(list[0].riskScore, 0.9);
  }));
