// ResultsRepository — storage-agnostic contract for test-result persistence.
//
// The Express routes depend ONLY on this interface, never on a concrete store.
// A SQLite implementation ships today (SqliteResultsRepository); a DynamoDB
// implementation can be added later that satisfies the same contract, without
// touching the endpoints. See DECISIONS.md.
//
// Contract (all methods may be async to allow network-backed stores):
//   save(result)                -> Promise<StoredResult>
//   list({ userId, modality, from, to }) -> Promise<StoredResult[]>  (desc by timestamp)
//
// StoredResult shape:
//   {
//     id: string,            // stable unique id
//     userId: string,        // "local-user" until real auth exists
//     type: "VOICE"|"FACE"|"FINGER_TAP",
//     name: string,
//     riskScore: number,     // 0-1
//     riskLevel: "Low"|"Medium"|"High",
//     timestamp: number,     // Unix ms
//     metadata: object|null  // free-form
//   }

"use strict";

const crypto = require("crypto");

const VALID_TYPES = ["VOICE", "FACE", "FINGER_TAP"];
const DEFAULT_USER_ID = "local-user";

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

/**
 * Abstract base. Concrete repositories must implement save() and list().
 * Extending this is optional (duck typing is fine), but it documents the shape.
 */
class ResultsRepository {
  // eslint-disable-next-line no-unused-vars
  async save(result) {
    throw new Error("ResultsRepository.save() not implemented");
  }
  // eslint-disable-next-line no-unused-vars
  async list(filter) {
    throw new Error("ResultsRepository.list() not implemented");
  }
}

/**
 * Validate and normalize an incoming result payload into a StoredResult.
 * Fills in id, timestamp, and userId defaults. Throws ValidationError on bad input.
 */
function normalizeResult(input) {
  if (!input || typeof input !== "object") {
    throw new ValidationError("Request body must be a JSON object");
  }

  const type = String(input.type || "").toUpperCase();
  if (!VALID_TYPES.includes(type)) {
    throw new ValidationError(
      `"type" must be one of ${VALID_TYPES.join(", ")}`
    );
  }

  const riskScore = Number(input.riskScore);
  if (!Number.isFinite(riskScore) || riskScore < 0 || riskScore > 1) {
    throw new ValidationError('"riskScore" must be a number in [0, 1]');
  }

  const riskLevel = String(input.riskLevel || "");
  if (!["Low", "Medium", "High"].includes(riskLevel)) {
    throw new ValidationError('"riskLevel" must be Low, Medium, or High');
  }

  let timestamp = input.timestamp === undefined ? Date.now() : Number(input.timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new ValidationError('"timestamp" must be a positive Unix-ms number');
  }

  let metadata = null;
  if (input.metadata !== undefined && input.metadata !== null) {
    if (typeof input.metadata !== "object") {
      throw new ValidationError('"metadata" must be an object when provided');
    }
    metadata = input.metadata;
  }

  const userId =
    input.userId && String(input.userId).trim()
      ? String(input.userId).trim()
      : DEFAULT_USER_ID;

  const id = input.id && String(input.id).trim() ? String(input.id) : crypto.randomUUID();

  return {
    id,
    userId,
    type,
    name: String(input.name || type),
    riskScore,
    riskLevel,
    timestamp,
    metadata,
  };
}

/** Parse and validate list() filter query params. */
function normalizeFilter(query) {
  const filter = {};
  filter.userId =
    query.userId && String(query.userId).trim()
      ? String(query.userId).trim()
      : DEFAULT_USER_ID;

  if (query.modality) {
    const modality = String(query.modality).toUpperCase();
    if (!VALID_TYPES.includes(modality)) {
      throw new ValidationError(
        `"modality" must be one of ${VALID_TYPES.join(", ")}`
      );
    }
    filter.modality = modality;
  }

  if (query.from !== undefined) {
    const from = Number(query.from);
    if (!Number.isFinite(from)) throw new ValidationError('"from" must be a Unix-ms number');
    filter.from = from;
  }
  if (query.to !== undefined) {
    const to = Number(query.to);
    if (!Number.isFinite(to)) throw new ValidationError('"to" must be a Unix-ms number');
    filter.to = to;
  }
  return filter;
}

module.exports = {
  ResultsRepository,
  ValidationError,
  normalizeResult,
  normalizeFilter,
  VALID_TYPES,
  DEFAULT_USER_ID,
};
