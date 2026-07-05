# NeuroVoice backend — single container image.
#
# Bundles everything server.js needs at runtime:
#   • Node.js  — Express API (/predict, /api/*) + WhatsApp webhook
#   • Python 3 — v4 Logistic Regression inference (inference.py)
#   • ffmpeg   — audio format conversion (server.js shells out to it)
#   • model files — backend/python/model/*.joblib + feature lists
#
# Build context is the `backend/` directory:
#   docker build -t neurovoice-backend -f backend/Dockerfile backend
# Run:
#   docker run --rm -p 5050:5050 neurovoice-backend
#
# NOTE: This image was authored but NOT built/verified in the dev environment
# (Docker was unavailable). See DECISIONS.md.

FROM node:20-bookworm-slim

# ── System dependencies ──────────────────────────────────────────────────────
# python3      : runs inference.py
# ffmpeg       : audio conversion (invoked by name from server.js)
# libsndfile1  : native lib required by soundfile/librosa
# build-essential + python3-dev : native builds for better-sqlite3 and any
#                py wheels without prebuilts
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      python3-dev \
      ffmpeg \
      libsndfile1 \
      build-essential \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python inference environment ─────────────────────────────────────────────
# Copy just the requirements first for better layer caching.
COPY python/requirements.txt ./python/requirements.txt
# Debian bookworm marks the system Python as externally-managed (PEP 668);
# --break-system-packages installs globally inside the container, which is fine
# here since the container is single-purpose. server.js calls `python3`, which
# then finds these packages on the system path.
RUN pip3 install --no-cache-dir --break-system-packages \
      -r python/requirements.txt

# ── Node backend dependencies ────────────────────────────────────────────────
COPY node/package.json node/package-lock.json ./node/
# Prefer reproducible install; fall back to npm install if the lockfile drifts.
RUN cd node && (npm ci --omit=dev || npm install --omit=dev)

# ── Application source ───────────────────────────────────────────────────────
# Includes python/model/*.joblib and the Node server. .dockerignore keeps
# node_modules, virtualenvs, SQLite files, and temp audio out of the context.
COPY python ./python
COPY node ./node

# SQLite persistence lives here; mount a volume to persist across restarts.
RUN mkdir -p /app/node/data
ENV RESULTS_DB_PATH=/app/node/data/results.db
ENV PORT=5050

EXPOSE 5050

# server.js resolves ../python/inference.py relative to its own dir (/app/node).
WORKDIR /app/node
CMD ["node", "server.js"]
