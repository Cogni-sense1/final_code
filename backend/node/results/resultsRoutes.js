// Express routes for the results persistence layer.
//
//   POST /api/results         save a test result
//   GET  /api/results         list history (filter: modality, from, to, userId)
//   GET  /api/overall-risk    fused risk over the filtered window
//
// Depends only on the ResultsRepository contract, so the storage backend can be
// swapped (SQLite today, DynamoDB later) without changing this file.

"use strict";

const express = require("express");
const {
  normalizeResult,
  normalizeFilter,
  ValidationError,
} = require("./ResultsRepository");
const { calculateOverallRisk } = require("./riskFusion");

/**
 * Build a router bound to a repository instance.
 * @param {{save:Function, list:Function}} repository
 */
function createResultsRouter(repository) {
  const router = express.Router();
  router.use(express.json({ limit: "256kb" }));

  // POST /api/results
  router.post("/results", async (req, res) => {
    try {
      const record = normalizeResult(req.body);
      const saved = await repository.save(record);
      res.status(201).json(saved);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /api/results
  router.get("/results", async (req, res) => {
    try {
      const filter = normalizeFilter(req.query);
      const results = await repository.list(filter);
      res.json(results);
    } catch (err) {
      handleError(res, err);
    }
  });

  // GET /api/overall-risk
  router.get("/overall-risk", async (req, res) => {
    try {
      const filter = normalizeFilter(req.query);
      // If a `days` window is given and no explicit `from`, derive `from`.
      if (req.query.days !== undefined && filter.from === undefined) {
        const days = Number(req.query.days);
        if (!Number.isFinite(days) || days <= 0) {
          throw new ValidationError('"days" must be a positive number');
        }
        filter.from = Date.now() - days * 24 * 60 * 60 * 1000;
      }
      const results = await repository.list(filter);
      const overall = calculateOverallRisk(results);
      res.json(overall);
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
}

function handleError(res, err) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  // eslint-disable-next-line no-console
  console.error("❌ results API error:", err);
  return res.status(500).json({ error: "Internal server error" });
}

module.exports = { createResultsRouter };
