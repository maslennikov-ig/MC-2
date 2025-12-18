# MCP Server Configuration Setup

## TL;DR - Quick Start

```bash
# 1. Create your credentials file
cp .env.example .env.local

# 2. Edit .env.local with your actual credentials
nano .env.local

# 3. Switch MCP configuration
./switch-mcp.sh

# 4. Restart Claude Code
# Done! Variables load automatically.
```

**Note**: No manual export needed - Claude Code automatically loads `.env.local` on startup.

---

## Overview

This project uses MCP (Model Context Protocol) servers for various integrations. All sensitive credentials are stored in `.env.local` and referenced by MCP configuration files.

## Initial Setup

### 1. Create your environment file

```bash
cp .env.example .env.local
```

### 2. Fill in your credentials

Edit `.env.local` and replace all placeholder values with your actual credentials:

```bash
# Supabase Configuration
SUPABASE_PROJECT_REF=your_actual_project_ref
SUPABASE_ACCESS_TOKEN=your_actual_token
# ... etc
```

### 3. Select MCP configuration

**Note**: Claude Code automatically loads `.env.local` from your project directory. No manual export needed!

Use the switcher script to select which MCP servers to load:

```bash
./switch-mcp.sh
```

Available configurations:
- **BASE** - Context7 + Sequential Thinking (~600 tokens)
- **SUPABASE** - BASE + Supabase MegaCampusAI (~2500 tokens)
- **SUPABASE + LEGACY** - BASE + both Supabase projects (~3000 tokens)
- **N8N** - BASE + n8n workflow automation (~2500 tokens)
- **FRONTEND** - BASE + Playwright + ShadCN (~2000 tokens)
- **FULL** - All servers combined (~5000 tokens)

### 4. Restart Claude Code

After switching configurations, restart Claude Code for changes to take effect.

**When to restart Claude Code:**
- ✅ After switching MCP configurations (using `./switch-mcp.sh`)
- ✅ After updating `.env.local` credentials
- ❌ NOT needed when switching between conversations
- ❌ NOT needed when making code changes

Environment variables are loaded once at startup from `.env.local`.

## Required Credentials

### Supabase

Get from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api

- `SUPABASE_PROJECT_REF` - Project reference ID
- `SUPABASE_ACCESS_TOKEN` - Personal access token
- `SUPABASE_DB_PASSWORD` - Database password
- `SUPABASE_LEGACY_PROJECT_REF` - Legacy project ref (if applicable)

### Sequential Thinking (Smithery)

Get from: https://smithery.ai/

- `SEQUENTIAL_THINKING_KEY` - API key
- `SEQUENTIAL_THINKING_PROFILE` - Profile identifier

### n8n

Get from your n8n instance settings:

- `N8N_API_URL` - Your n8n instance URL
- `N8N_API_KEY` - API key from n8n settings

## File Structure

```
.
├── .env.local              # Your credentials (git-ignored)
├── .env.example            # Template (committed to git)
├── .mcp.json               # Active config (generated, git-ignored)
├── .mcp.base.json          # Base configuration (committed)
├── .mcp.supabase-only.json # Supabase only (committed)
├── .mcp.supabase-full.json # Supabase + Legacy (committed)
├── .mcp.n8n.json           # n8n config (committed)
├── .mcp.frontend.json      # Frontend tools (committed)
├── .mcp.full.json          # All servers (committed)
└── switch-mcp.sh           # Configuration switcher (committed)
```

## Security Notes

- ✅ **DO commit**: `.mcp.*.json` files (they use env variables, no secrets)
- ✅ **DO commit**: `.env.example` (template only)
- ❌ **DO NOT commit**: `.env.local` (contains actual credentials)
- ❌ **DO NOT commit**: `.mcp.json` (generated file)

## Troubleshooting

### Variables not resolving

If you see `${VARIABLE_NAME}` in error messages:

1. Check that `.env.local` exists and contains the variable
2. Verify the variable name matches exactly (case-sensitive)
3. Restart Claude Code to reload environment variables
4. Check Claude Code logs for specific errors

### MCP server fails to start

1. Check Claude Code logs for specific error messages
2. Verify credentials in `.env.local` are correct
3. Test credentials manually (e.g., `curl` for API endpoints)
4. Try BASE configuration first to isolate the issue

## Getting Help

- MCP Documentation: https://modelcontextprotocol.io
- Claude Code Documentation: https://docs.claude.com/claude-code
- Project Issues: Check `docs/` for troubleshooting guides
