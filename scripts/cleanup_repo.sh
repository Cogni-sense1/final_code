#!/usr/bin/env bash
# Safe cleanup script to remove large local artifacts before committing/pushing
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "Running cleanup in ${ROOT_DIR}"

read -p "This will delete local virtualenvs and leftover .kiro files (cannot be undone). Continue? [y/N] " ans
if [[ "$ans" != "y" && "$ans" != "Y" ]]; then
  echo "Aborting. No changes made."
  exit 0
fi

rm -rf "${ROOT_DIR}/.kiro" || true
rm -rf "${ROOT_DIR}/.venv" || true
rm -rf "${ROOT_DIR}/backend/python/venv" || true
rm -rf "${ROOT_DIR}/node_modules" || true
rm -rf "${ROOT_DIR}/backend/node/node_modules" || true
rm -rf "${ROOT_DIR}/neurovoice-mobile/node_modules" || true

echo "Cleanup finished."
echo "Now you can initialize git and push the repo to GitHub. Example:" 
echo "  cd ${ROOT_DIR}"
echo "  git init"
echo "  git add ."
echo "  git commit -m 'Initial commit'"
echo "  git branch -M main"
echo "  git remote add origin <YOUR_GIT_URL>"
echo "  git push -u origin main"
