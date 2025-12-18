#!/bin/bash
#
# pgTAP Test Runner with Environment Check
#
# This script checks if local Supabase is running before attempting pgTAP tests.
# pgTAP tests require direct PostgreSQL connection (DATABASE_URL) which is only
# available with local Supabase instance, not cloud-only setup.

set -e

echo "════════════════════════════════════════════════════════════"
echo "  pgTAP Test Runner - RLS Policy Validation"
echo "════════════════════════════════════════════════════════════"
echo ""

# Check if Supabase CLI is installed (via npx or global)
if ! npx supabase --version &> /dev/null && ! command -v supabase &> /dev/null; then
    echo "❌ ERROR: Supabase CLI not installed"
    echo ""
    echo "   Install: npm install -g supabase"
    echo ""
    exit 1
fi

# Use npx if global supabase not available
SUPABASE_CMD="supabase"
if ! command -v supabase &> /dev/null; then
    SUPABASE_CMD="npx supabase"
fi

# Check if local Supabase is running
echo "🔍 Checking local Supabase status..."
echo ""

# Try to connect to local Postgres (port 54322)
if ! nc -z 127.0.0.1 54322 2>/dev/null; then
    echo "⚠️  LOCAL SUPABASE NOT RUNNING"
    echo ""
    echo "   pgTAP tests require local PostgreSQL connection."
    echo "   Current setup uses Supabase Cloud which only provides REST API."
    echo ""
    echo "   To run pgTAP tests:"
    echo ""
    echo "   1. Install Docker (if not installed)"
    echo "      WSL: https://docs.docker.com/desktop/wsl/"
    echo ""
    echo "   2. Start local Supabase:"
    echo "      cd packages/course-gen-platform"
    echo "      supabase start"
    echo ""
    echo "   3. Run pgTAP tests:"
    echo "      pnpm test:rls"
    echo ""
    echo "   Expected: 8 RLS policy tests in supabase/tests/database/"
    echo ""
    echo "════════════════════════════════════════════════════════════"
    exit 0  # Exit gracefully, not an error
fi

# Local Supabase is running - run tests
echo "✅ Local Supabase detected at 127.0.0.1:54322"
echo ""
echo "Running pgTAP tests..."
echo ""

cd ../.. && $SUPABASE_CMD test db --workdir packages/course-gen-platform
