#!/bin/bash
set -e
cd "$(dirname "$0")/.."
mkdir -p reviews
if tmux has-session -t vsdaw-review 2>/dev/null; then
  echo "Session vsdaw-review already exists"
else
  tmux new-session -d -s vsdaw-review "node scripts/review-watcher.mjs"
  echo "Started tmux session vsdaw-review"
fi
echo "Attach with: tmux attach -t vsdaw-review"
