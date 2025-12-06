#!/bin/bash
cd /home/kavia/workspace/code-generation/collaborate-ai-platform-287250-287260/node_apollo_backend
npm run lint
LINT_EXIT_CODE=$?
if [ $LINT_EXIT_CODE -ne 0 ]; then
  exit 1
fi

