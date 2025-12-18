#!/bin/bash

# Test Data Seeding Runner Script
# Usage: ./run-seed.sh [clean]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Test Data Seeding Utility${NC}"
echo "=========================="
echo ""

# Check if .env file exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${RED}Error: .env file not found in $PROJECT_ROOT${NC}"
    echo "Please create a .env file with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    cd "$PROJECT_ROOT" && pnpm install
fi

# Run the seeding script
if [ "$1" == "clean" ]; then
    echo -e "${YELLOW}Cleaning database...${NC}"
    cd "$PROJECT_ROOT" && npx ts-node tests/fixtures/seed-database.ts clean
else
    echo -e "${GREEN}Seeding database with test data...${NC}"
    cd "$PROJECT_ROOT" && npx ts-node tests/fixtures/seed-database.ts
fi

exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}✅ Operation completed successfully!${NC}"
else
    echo -e "${RED}❌ Operation failed with exit code $exit_code${NC}"
fi

exit $exit_code