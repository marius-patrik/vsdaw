# Codex Review Watcher

A tmux session named `vsdaw-review` runs `scripts/review-watcher.mjs`.
It polls all `issue/*-feature` branches for new commits and runs `codex review --commit <sha>`.

Attach: `tmux attach -t vsdaw-review`
Start: `bash scripts/start-review-tmux.sh`
Stop: `tmux kill-session -t vsdaw-review`

Review outputs are saved to `reviews/issue-N-<shortsha>.md`.
