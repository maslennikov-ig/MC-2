#!/bin/bash
set -a
source .env
set +a
pnpm exec tsx scripts/test-phase1-output.ts
