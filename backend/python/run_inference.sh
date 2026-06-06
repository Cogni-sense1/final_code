#!/usr/bin/env bash
# Wrapper to activate python venv and run inference.py
set -e
cd "$(dirname "$0")"
if [ -d venv ]; then
  # shellcheck disable=SC1091
  source venv/bin/activate
else
  echo "Virtualenv 'venv' not found. Creating one..."
  python3 -m venv venv
  # shellcheck disable=SC1091
  source venv/bin/activate
  pip install -r requirements.txt
fi
python3 inference.py "$@"
