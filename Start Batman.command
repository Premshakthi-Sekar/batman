#!/bin/bash
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v npm >/dev/null 2>&1; then
  echo "Node/npm not found. Install Node from https://nodejs.org or: brew install node"
  read -r -p "Press Enter to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing Batman..."
  npm install
fi

echo "Starting Desktop Batman. Leave this window open."
echo "Press Control+C here, or Quit inside Batman, to stop him."
npm start
