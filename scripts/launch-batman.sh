#!/bin/bash
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v npm >/dev/null 2>&1; then
  exit 1
fi

if [ ! -d node_modules ]; then
  npm install
fi

exec npm start
