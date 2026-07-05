// SQLite-backed ResultsRepository (local implementation).
//
// Cloud-ready by design: everything SQLite-specific is contained here. To run
// on DynamoDB later, add a DynamoResultsRepository with the same save()/list()
// contract and swap it in server.js — the routes never change.

"use strict";

const Database = require("better-sqlite3");
const { ResultsRepository } = require("./ResultsRepository");

class SqliteResultsRepository extends ResultsRepository {
  /**
   * @param {string} dbPath Path to the SQLite file (":memory:" for ephemeral).
   */
  constructor(dbPath) {
    super();
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this._init();
    this._prepare();
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS results (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        type       TEXT NOT NULL,
        name       TEXT NOT NULL,
        risk_score REAL NOT NULL,
        risk_level TEXT NOT NULL,
        timestamp  INTEGER NOT NULL,
        metadata   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_results_user_ts
        ON results (user_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_results_user_type_ts
        ON results (user_id, type, timestamp DESC);
    `);
  }

  _prepare() {
    this._insert = this.db.prepare(`
      INSERT INTO results (id, user_id, type, name, risk_score, risk_level, timestamp, metadata)
      VALUES (@id, @user_id, @type, @name, @risk_score, @risk_level, @timestamp, @metadata)
      ON CONFLICT(id) DO UPDATE SET
        user_id=excluded.user_id, type=excluded.type, name=excluded.name,
        risk_score=excluded.risk_score, risk_level=excluded.risk_level,
        timestamp=excluded.timestamp, metadata=excluded.metadata
    `);
  }

  /** @param {import('./ResultsRepository').StoredResult} result normalized */
  async save(result) {
    this._insert.run({
      id: result.id,
      user_id: result.userId,
      type: result.type,
      name: result.name,
      risk_score: result.riskScore,
      risk_level: result.riskLevel,
      timestamp: result.timestamp,
      metadata: result.metadata ? JSON.stringify(result.metadata) : null,
    });
    return result;
  }

  /** @param {{userId:string, modality?:string, from?:number, to?:number}} filter */
  async list(filter = {}) {
    const clauses = ["user_id = @userId"];
    const params = { userId: filter.userId || "local-user" };

    if (filter.modality) {
      clauses.push("type = @modality");
      params.modality = filter.modality;
    }
    if (filter.from !== undefined) {
      clauses.push("timestamp >= @from");
      params.from = filter.from;
    }
    if (filter.to !== undefined) {
      clauses.push("timestamp <= @to");
      params.to = filter.to;
    }

    const rows = this.db
      .prepare(
        `SELECT * FROM results WHERE ${clauses.join(" AND ")} ORDER BY timestamp DESC`
      )
      .all(params);

    return rows.map(this._rowToResult);
  }

  _rowToResult(row) {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      name: row.name,
      riskScore: row.risk_score,
      riskLevel: row.risk_level,
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    };
  }

  /** Close the underlying database handle. */
  close() {
    this.db.close();
  }
}

module.exports = { SqliteResultsRepository };
