#Requires -Version 5.1
<#
.SYNOPSIS
    MegaCampusAI Development Environment — Windows (PowerShell)
.DESCRIPTION
    Equivalent of start-dev.sh adapted for native Windows PowerShell.
    Starts: NotebookLM bridge, Redis, Backend, Workers (1-5, Stage6, Stage7), Frontend.
.PARAMETER Verbose
    Enable trace-level logging (LOG_LEVEL=trace).
.EXAMPLE
    .\start-dev.ps1
    .\start-dev.ps1 -Verbose
#>
[CmdletBinding()]
param(
    [switch]$VerboseMode   # named differently to avoid collision with PS builtin $Verbose
)

Set-StrictMode -Off
$ErrorActionPreference = 'Continue'

# =============================================================================
# COLORS (Write-Host helpers)
# =============================================================================
function Write-Green  { param($msg) Write-Host $msg -ForegroundColor Green  }
function Write-Blue   { param($msg) Write-Host $msg -ForegroundColor Cyan   }
function Write-Yellow { param($msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Red    { param($msg) Write-Host $msg -ForegroundColor Red    }

# =============================================================================
# LOGGING CONFIGURATION
# =============================================================================
$SCRIPT_DIR  = $PSScriptRoot
$LOGS_DIR    = Join-Path $SCRIPT_DIR "logs\dev"
$SESSION_ID  = (Get-Date -Format "yyyyMMdd-HHmmss")

New-Item -ItemType Directory -Force -Path $LOGS_DIR | Out-Null

$BACKEND_LOG       = Join-Path $LOGS_DIR "backend-$SESSION_ID.log"
$WORKER_LOG        = Join-Path $LOGS_DIR "worker-$SESSION_ID.log"
$WORKER_STAGE6_LOG = Join-Path $LOGS_DIR "worker-stage6-$SESSION_ID.log"
$WORKER_STAGE7_LOG = Join-Path $LOGS_DIR "worker-stage7-$SESSION_ID.log"
$FRONTEND_LOG      = Join-Path $LOGS_DIR "frontend-$SESSION_ID.log"
$COMBINED_LOG      = Join-Path $LOGS_DIR "combined-$SESSION_ID.log"

# Create/update "latest" symlinks (requires Developer Mode or admin on Windows)
$latestLinks = @{
    "backend-latest.log"       = "backend-$SESSION_ID.log"
    "worker-latest.log"        = "worker-$SESSION_ID.log"
    "worker-stage6-latest.log" = "worker-stage6-$SESSION_ID.log"
    "worker-stage7-latest.log" = "worker-stage7-$SESSION_ID.log"
    "frontend-latest.log"      = "frontend-$SESSION_ID.log"
    "combined-latest.log"      = "combined-$SESSION_ID.log"
}
foreach ($link in $latestLinks.GetEnumerator()) {
    $linkPath   = Join-Path $LOGS_DIR $link.Key
    $targetPath = Join-Path $LOGS_DIR $link.Value
    if (Test-Path $linkPath) { Remove-Item $linkPath -Force }
    try {
        New-Item -ItemType SymbolicLink -Path $linkPath -Target $targetPath -Force | Out-Null
    } catch {
        # Symlinks may require elevated rights; fall back to hardlink / skip
        try { New-Item -ItemType HardLink -Path $linkPath -Target $targetPath -Force | Out-Null } catch {}
    }
}

# Keep only last 10 log sessions per prefix
foreach ($prefix in @('backend','worker','worker-stage6','worker-stage7','frontend','combined')) {
    $old = Get-ChildItem -Path $LOGS_DIR -Filter "$prefix-*.log" -File |
           Sort-Object LastWriteTime -Descending |
           Select-Object -Skip 10
    $old | Remove-Item -Force -ErrorAction SilentlyContinue
}

# =============================================================================
# CLI OPTIONS
# =============================================================================
if ($VerboseMode) {
    $env:LOG_LEVEL = "trace"
    Write-Yellow "🔍 Verbose mode: LOG_LEVEL=trace (showing all logs)"
} else {
    $env:LOG_LEVEL = "info"
}

Write-Blue "🚀 Starting MegaCampusAI Development Environment..."
Write-Blue "📝 Logs: $LOGS_DIR"

# =============================================================================
# HELPERS
# =============================================================================
function Read-EnvValue {
    param([string]$Key, [string]$File)
    if (-not (Test-Path $File)) { return $null }
    $line = Get-Content $File -ErrorAction SilentlyContinue |
            Where-Object { $_ -match "^$Key=(.*)$" } |
            Select-Object -Last 1
    if ($line -match "^$Key=(.*)$") { return $Matches[1].Trim() }
    return $null
}

function Compute-BridgeContextHash {
    param([string]$ContextDir)
    $files = Get-ChildItem -Path $ContextDir -Recurse -File |
             Where-Object { $_.FullName -notmatch '\\\.git\\' -and
                            $_.FullName -notmatch '__pycache__' -and
                            $_.FullName -notmatch '\.pyc$' } |
             Sort-Object FullName
    $combined = ($files | ForEach-Object {
        $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
        "$hash  $($_.FullName)"
    }) -join "`n"
    return (($combined | Out-String) |
            ForEach-Object {
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($_)
                $sha   = [System.Security.Cryptography.SHA256]::Create()
                [System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLower()
            })
}

function Kill-ProcessOnPort {
    param([int]$Port)
    $conn = netstat -ano 2>$null | Select-String ":$Port\s"
    if ($conn) {
        $pid_ = ($conn | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique)[0]
        if ($pid_ -and $pid_ -match '^\d+$') {
            Stop-Process -Id ([int]$pid_) -Force -ErrorAction SilentlyContinue
            return $true
        }
    }
    return $false
}

function Test-RedisRunning {
    $result = docker exec megacampus-redis redis-cli ping 2>$null
    return ($result -eq "PONG")
}

# =============================================================================
# NOTEBOOKLM BRIDGE
# =============================================================================
$NLM_BRIDGE_CONTAINER   = "megacampus-notebooklm-bridge-local"
$NLM_BRIDGE_IMAGE       = "megacampus/notebooklm-bridge-local:dev"
$NLM_BRIDGE_PORT        = "8010"
$NLM_BRIDGE_BUILD_CTX   = Join-Path $SCRIPT_DIR "packages\course-gen-platform\docker\notebooklm-bridge"
$NLM_BRIDGE_CACHE_DIR   = Join-Path $SCRIPT_DIR ".cache\notebooklm-bridge"
$NLM_BRIDGE_HASH_FILE   = Join-Path $NLM_BRIDGE_CACHE_DIR "context.sha256"
$NLM_BRIDGE_WAS_RUNNING     = $false
$NLM_BRIDGE_STARTED_BY_SCRIPT = $false

Write-Host ""
Write-Yellow "🎧 Starting local NotebookLM bridge..."

# Verify docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Red "❌ Docker not found. Cannot start local NotebookLM bridge."
    exit 1
}

if (-not (Test-Path $NLM_BRIDGE_BUILD_CTX)) {
    Write-Red "❌ NotebookLM bridge build context not found: $NLM_BRIDGE_BUILD_CTX"
    exit 1
}

$COURSE_ENV_FILE = Join-Path $SCRIPT_DIR "packages\course-gen-platform\.env"
$BRIDGE_TOKEN    = if ($env:NOTEBOOKLM_BRIDGE_TOKEN) { $env:NOTEBOOKLM_BRIDGE_TOKEN } else { Read-EnvValue "NOTEBOOKLM_BRIDGE_TOKEN" $COURSE_ENV_FILE }
$AUTH_JSON       = if ($env:NOTEBOOKLM_AUTH_JSON)     { $env:NOTEBOOKLM_AUTH_JSON     } else { Read-EnvValue "NOTEBOOKLM_AUTH_JSON"     $COURSE_ENV_FILE }
$STORAGE_STATE_DIR = if ($env:NOTEBOOKLM_STORAGE_STATE_DIR) { $env:NOTEBOOKLM_STORAGE_STATE_DIR } else { Read-EnvValue "NOTEBOOKLM_STORAGE_STATE_DIR" $COURSE_ENV_FILE }
$STORAGE_PATH    = if ($env:NOTEBOOKLM_STORAGE_PATH)  { $env:NOTEBOOKLM_STORAGE_PATH  } else { Read-EnvValue "NOTEBOOKLM_STORAGE_PATH"  $COURSE_ENV_FILE }

$USE_AUTH_JSON = ($null -ne $AUTH_JSON -and $AUTH_JSON -ne '')

if (-not $USE_AUTH_JSON) {
    if (-not $STORAGE_STATE_DIR) { $STORAGE_STATE_DIR = Join-Path $SCRIPT_DIR "secrets\notebooklm" }
    if (-not $STORAGE_PATH)      { $STORAGE_PATH = "/app/secrets/notebooklm/storage_state.json" }
    $STORAGE_FILENAME        = Split-Path $STORAGE_PATH -Leaf
    $LOCAL_STORAGE_STATE_FILE = Join-Path $STORAGE_STATE_DIR $STORAGE_FILENAME
}

if (-not $BRIDGE_TOKEN) {
    Write-Red "❌ NOTEBOOKLM_BRIDGE_TOKEN is not set (env or packages/course-gen-platform/.env)."
    Write-Yellow "   Generate one with: openssl rand -hex 32"
    Write-Yellow "   Then set NOTEBOOKLM_BRIDGE_TOKEN in your shell or packages/course-gen-platform/.env"
    exit 1
}

New-Item -ItemType Directory -Force -Path $NLM_BRIDGE_CACHE_DIR | Out-Null

if ($USE_AUTH_JSON) {
    if ($STORAGE_PATH) {
        Write-Yellow "⚠️  NOTEBOOKLM_STORAGE_PATH is set but will be ignored because NOTEBOOKLM_AUTH_JSON is provided."
    }
    Write-Host "   ✅ Using NOTEBOOKLM_AUTH_JSON for NotebookLM bridge auth."
} else {
    New-Item -ItemType Directory -Force -Path $STORAGE_STATE_DIR | Out-Null

    if (-not (Test-Path $LOCAL_STORAGE_STATE_FILE)) {
        Write-Red "❌ NotebookLM auth storage file not found: $LOCAL_STORAGE_STATE_FILE"
        Write-Yellow "   Run login first:"
        Write-Yellow "   notebooklm --storage `"$LOCAL_STORAGE_STATE_FILE`" login"
        exit 1
    }

    # Validate storage_state.json with Python
    $pyScript = @"
import json, sys
path = sys.argv[1]
try:
    with open(path, 'r', encoding='utf-8') as f:
        payload = json.load(f)
except Exception as e:
    print(f'Invalid storage_state.json: {e}')
    sys.exit(1)
cookies = payload.get('cookies')
if not isinstance(cookies, list):
    print("Invalid storage_state.json: missing top-level 'cookies' array")
    sys.exit(1)
names = sorted({str(c.get('name')) for c in cookies if isinstance(c, dict) and c.get('name')})
if 'SID' not in names:
    preview = ', '.join(names[:8]) if names else '(none)'
    print(f"Missing required NotebookLM cookie 'SID'. Found: {preview}")
    sys.exit(1)
print('ok')
"@
    $pyResult = & python -c $pyScript "$LOCAL_STORAGE_STATE_FILE" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Red "❌ NotebookLM auth storage is invalid: $pyResult"
        Write-Yellow "   Re-run login: notebooklm --storage `"$LOCAL_STORAGE_STATE_FILE`" login"
        exit 1
    }
}

# Export bridge env vars
$env:NOTEBOOKLM_BRIDGE_URL                    = "http://127.0.0.1:${NLM_BRIDGE_PORT}"
$env:NOTEBOOKLM_BRIDGE_TOKEN                  = $BRIDGE_TOKEN
$env:NOTEBOOKLM_BRIDGE_TIMEOUT_MS             = if ($env:NOTEBOOKLM_BRIDGE_TIMEOUT_MS)             { $env:NOTEBOOKLM_BRIDGE_TIMEOUT_MS }             else { "3600000" }
$env:NOTEBOOKLM_BRIDGE_POLL_REQUEST_TIMEOUT_MS = if ($env:NOTEBOOKLM_BRIDGE_POLL_REQUEST_TIMEOUT_MS) { $env:NOTEBOOKLM_BRIDGE_POLL_REQUEST_TIMEOUT_MS } else { "30000" }
$env:NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS    = if ($env:NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS)    { $env:NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS }    else { "3600" }
$env:NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS    = if ($env:NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS)    { $env:NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS }    else { "3600" }
$env:NOTEBOOKLM_HTTP_TIMEOUT_SECONDS          = if ($env:NOTEBOOKLM_HTTP_TIMEOUT_SECONDS)          { $env:NOTEBOOKLM_HTTP_TIMEOUT_SECONDS }          else { "60" }
$env:NOTEBOOKLM_POLL_ERROR_RETRY_LIMIT        = if ($env:NOTEBOOKLM_POLL_ERROR_RETRY_LIMIT)        { $env:NOTEBOOKLM_POLL_ERROR_RETRY_LIMIT }        else { "12" }
$env:NOTEBOOKLM_LOG_LEVEL                     = if ($env:NOTEBOOKLM_LOG_LEVEL)                     { $env:NOTEBOOKLM_LOG_LEVEL }                     else { "INFO" }

if ($USE_AUTH_JSON) {
    $env:NOTEBOOKLM_AUTH_JSON      = $AUTH_JSON
    Remove-Item Env:\NOTEBOOKLM_STORAGE_STATE_DIR -ErrorAction SilentlyContinue
    $env:NOTEBOOKLM_STORAGE_PATH   = ""
} else {
    Remove-Item Env:\NOTEBOOKLM_AUTH_JSON -ErrorAction SilentlyContinue
    $env:NOTEBOOKLM_STORAGE_STATE_DIR = $STORAGE_STATE_DIR
    $env:NOTEBOOKLM_STORAGE_PATH      = $STORAGE_PATH
}

# Local enrichments storage
$env:USE_LOCAL_STORAGE = if ($env:USE_LOCAL_STORAGE) { $env:USE_LOCAL_STORAGE } else { "true" }
if ($env:USE_LOCAL_STORAGE -eq "true" -or $env:USE_LOCAL_STORAGE -eq "1") {
    $enrichPath = if ($env:ENRICHMENTS_LOCAL_PATH) { $env:ENRICHMENTS_LOCAL_PATH } else { Join-Path $SCRIPT_DIR "data\enrichments" }
    $env:ENRICHMENTS_LOCAL_PATH     = $enrichPath
    $env:ENRICHMENTS_PUBLIC_URL     = if ($env:ENRICHMENTS_PUBLIC_URL)     { $env:ENRICHMENTS_PUBLIC_URL }     else { "/storage/enrichments" }
    $env:ENRICHMENTS_PUBLIC_BASE_URL = if ($env:ENRICHMENTS_PUBLIC_BASE_URL) { $env:ENRICHMENTS_PUBLIC_BASE_URL } else { "http://127.0.0.1:3456" }
    New-Item -ItemType Directory -Force -Path $enrichPath | Out-Null
    Write-Host "   ✅ Local enrichments storage enabled: $enrichPath"
}

# Build bridge image if context changed
$CURRENT_BRIDGE_HASH = Compute-BridgeContextHash $NLM_BRIDGE_BUILD_CTX
$CACHED_BRIDGE_HASH  = if (Test-Path $NLM_BRIDGE_HASH_FILE) { Get-Content $NLM_BRIDGE_HASH_FILE } else { "" }
$LOCAL_BRIDGE_IMAGE_ID = (docker image inspect $NLM_BRIDGE_IMAGE --format '{{.Id}}' 2>$null)

if (-not $LOCAL_BRIDGE_IMAGE_ID -or $CURRENT_BRIDGE_HASH -ne $CACHED_BRIDGE_HASH) {
    Write-Host "   🔨 Building local NotebookLM bridge image..."
    docker build -t $NLM_BRIDGE_IMAGE $NLM_BRIDGE_BUILD_CTX | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Red "❌ Failed to build local NotebookLM bridge image."
        exit 1
    }
    $CURRENT_BRIDGE_HASH | Set-Content $NLM_BRIDGE_HASH_FILE
} else {
    Write-Host "   ✅ NotebookLM bridge image unchanged (build skipped)."
}

# Check if container needs recreation (image changed)
$DESIRED_BRIDGE_IMAGE_ID  = (docker image inspect $NLM_BRIDGE_IMAGE --format '{{.Id}}' 2>$null)
$EXISTING_BRIDGE_IMAGE_ID = (docker inspect $NLM_BRIDGE_CONTAINER --format '{{.Image}}' 2>$null)

if ($EXISTING_BRIDGE_IMAGE_ID -and $DESIRED_BRIDGE_IMAGE_ID -and ($EXISTING_BRIDGE_IMAGE_ID -ne $DESIRED_BRIDGE_IMAGE_ID)) {
    Write-Host "   ♻️  Recreating NotebookLM bridge container (image updated)..."
    docker rm -f $NLM_BRIDGE_CONTAINER 2>$null | Out-Null
}

# Start / ensure bridge container is running
$runningBridge = (docker ps -q -f "name=^/${NLM_BRIDGE_CONTAINER}$" 2>$null)
$stoppedBridge = (docker ps -aq -f "name=^/${NLM_BRIDGE_CONTAINER}$" 2>$null)

if ($runningBridge) {
    $NLM_BRIDGE_WAS_RUNNING = $true
    Write-Host "   ✅ NotebookLM bridge container already running."
} elseif ($stoppedBridge) {
    Write-Host "   🔄 NotebookLM bridge container exists but is stopped. Starting..."
    docker start $NLM_BRIDGE_CONTAINER | Out-Null
    $NLM_BRIDGE_STARTED_BY_SCRIPT = $true
} else {
    Write-Host "   ✨ Creating NotebookLM bridge container..."
    $dockerArgs = @(
        "run", "-d",
        "--name", $NLM_BRIDGE_CONTAINER,
        "-p", "127.0.0.1:${NLM_BRIDGE_PORT}:8000",
        "-e", "NOTEBOOKLM_BRIDGE_TOKEN=$BRIDGE_TOKEN",
        "-e", "NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS=$($env:NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS)",
        "-e", "NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS=$($env:NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS)",
        "-e", "NOTEBOOKLM_HTTP_TIMEOUT_SECONDS=$($env:NOTEBOOKLM_HTTP_TIMEOUT_SECONDS)",
        "-e", "NOTEBOOKLM_POLL_ERROR_RETRY_LIMIT=$($env:NOTEBOOKLM_POLL_ERROR_RETRY_LIMIT)",
        "-e", "NOTEBOOKLM_LOG_LEVEL=$($env:NOTEBOOKLM_LOG_LEVEL)"
    )
    if ($USE_AUTH_JSON) {
        $dockerArgs += "-e", "NOTEBOOKLM_AUTH_JSON=$AUTH_JSON"
        $dockerArgs += "-e", "NOTEBOOKLM_STORAGE_PATH="
    } else {
        $dockerArgs += "-e", "NOTEBOOKLM_STORAGE_PATH=$STORAGE_PATH"
        $dockerArgs += "-e", "NOTEBOOKLM_HOME=/app/secrets/notebooklm"
        # Convert Windows path to Docker-compatible path for volume mount
        $winStorageDir = $STORAGE_STATE_DIR -replace '\\', '/'
        $dockerArgs += "-v", "${winStorageDir}:/app/secrets/notebooklm:ro"
    }
    $dockerArgs += $NLM_BRIDGE_IMAGE
    & docker @dockerArgs | Out-Null
    $NLM_BRIDGE_STARTED_BY_SCRIPT = $true
}

# Health check
Start-Sleep -Seconds 2
try {
    $healthResp = Invoke-WebRequest -Uri "http://127.0.0.1:${NLM_BRIDGE_PORT}/health" -TimeoutSec 5 -ErrorAction SilentlyContinue
    if ($healthResp.StatusCode -eq 200) {
        Write-Green "   ✅ NotebookLM bridge healthy at http://127.0.0.1:${NLM_BRIDGE_PORT}"
    } else {
        Write-Yellow "⚠️  NotebookLM bridge started but health endpoint returned $($healthResp.StatusCode)."
    }
} catch {
    Write-Yellow "⚠️  NotebookLM bridge started but health endpoint is not ready yet."
}

# Schema sanity check
$bridgeSchemaKeys = (docker exec $NLM_BRIDGE_CONTAINER sh -c "python -c `"from app.models import MediaGenerationRequest; print(' '.join(MediaGenerationRequest.model_json_schema().get('properties', {}).keys()))`"" 2>$null)
if ($bridgeSchemaKeys -notmatch 'sources') {
    Write-Red "❌ NotebookLM bridge schema is outdated (missing 'sources')."
    Write-Yellow "   Rebuild failed or stale image is still running. Please re-run start-dev.ps1."
    exit 1
}

# =============================================================================
# CLEANUP OLD PROCESSES
# =============================================================================
Write-Host ""
Write-Yellow "🧹 Cleaning up old processes..."

# Kill old worker processes (node processes running worker-entrypoint)
$oldWorkers = Get-Process -Name "node" -ErrorAction SilentlyContinue |
              Where-Object { $_.MainWindowTitle -match 'worker-entrypoint' -or
                             (& { try { (Get-WmiObject Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine } catch {} }) -match 'worker-entrypoint' }
if ($oldWorkers) {
    Write-Host "   Found old worker processes: $($oldWorkers.Id -join ', ')"
    $oldWorkers | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Write-Green "   ✅ Old workers killed"
} else {
    Write-Host "   No old workers found"
}

# Kill processes on port 3456 (backend)
$killed3456 = Kill-ProcessOnPort 3456
if ($killed3456) {
    Write-Host "   Found and killed old backend on port 3456"
    Start-Sleep -Seconds 1
    Write-Green "   ✅ Old backend killed"
}

# Clean stalled BullMQ jobs (if Redis is accessible)
if (Test-RedisRunning) {
    $QUEUE_NAME_RAW = Read-EnvValue "BULLMQ_QUEUE_NAME" $COURSE_ENV_FILE
    $QUEUE_NAME = if ($QUEUE_NAME_RAW) { $QUEUE_NAME_RAW } else { "course-generation" }

    $stalledCount = (docker exec megacampus-redis redis-cli SCARD "bull:${QUEUE_NAME}:stalled" 2>$null)
    if ($stalledCount -and $stalledCount -ne "0") {
        Write-Host "   Found $stalledCount stalled jobs in ${QUEUE_NAME}, cleaning..."
        docker exec megacampus-redis redis-cli DEL "bull:${QUEUE_NAME}:stalled" | Out-Null
        Write-Green "   ✅ Stalled jobs cleared"
    }

    $stalledCountS7 = (docker exec megacampus-redis redis-cli SCARD "bull:stage7-enrichments:stalled" 2>$null)
    if ($stalledCountS7 -and $stalledCountS7 -ne "0") {
        Write-Host "   Found $stalledCountS7 stalled Stage 7 jobs, cleaning..."
        docker exec megacampus-redis redis-cli DEL "bull:stage7-enrichments:stalled" | Out-Null
        Write-Green "   ✅ Stalled Stage 7 jobs cleared"
    }
}

# =============================================================================
# CHECK AND START REDIS
# =============================================================================
Write-Host ""
Write-Yellow "📦 Checking Redis status..."

if (Test-RedisRunning) {
    Write-Host "✅ Redis is already running."
} elseif (docker ps -q -f "name=megacampus-redis" 2>$null) {
    Write-Host "✅ Redis container is already running."
} elseif (docker ps -aq -f "status=exited" -f "name=megacampus-redis" 2>$null) {
    Write-Host "🔄 Redis container exists but is stopped. Starting..."
    docker start megacampus-redis 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Yellow "⚠️  Could not start Redis container." }
} else {
    Write-Host "✨ Creating and starting new Redis container..."
    docker run -d --name megacampus-redis -p 6379:6379 redis:7-alpine 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Yellow "⚠️  Could not start Redis container." }
}

if (-not (Test-RedisRunning)) {
    Write-Yellow "⚠️  Warning: Redis is not responding. Some features may not work."
}

# Detect local IP for LAN access
$LOCAL_IP = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
             Where-Object { $_.IPAddress -match '^192\.168\.' } |
             Select-Object -First 1).IPAddress
if (-not $LOCAL_IP) {
    $LOCAL_IP = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                 Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' } |
                 Select-Object -First 1).IPAddress
}

# =============================================================================
# CLEANUP FUNCTION (registered with Ctrl+C handler)
# =============================================================================
$global:ServiceJobs = @()

function Stop-AllServices {
    Write-Host ""
    Write-Yellow "🛑 Shutting down services..."
    $global:ServiceJobs | ForEach-Object {
        if ($_ -and $_.HasMoreData -ne $null) {
            Stop-Job $_ -ErrorAction SilentlyContinue
            Remove-Job $_ -Force -ErrorAction SilentlyContinue
        }
    }
    # Kill child processes by name patterns
    Get-Process -Name "node" -ErrorAction SilentlyContinue |
        Where-Object { $_.StartTime -gt (Get-Date).AddHours(-8) } |
        Stop-Process -Force -ErrorAction SilentlyContinue

    if ($NLM_BRIDGE_STARTED_BY_SCRIPT -and -not $NLM_BRIDGE_WAS_RUNNING) {
        Write-Yellow "🧩 Stopping local NotebookLM bridge container..."
        docker stop $NLM_BRIDGE_CONTAINER 2>$null | Out-Null
    }
    Write-Green "👋 Development environment stopped."
    Write-Blue "📝 Logs saved to: $LOGS_DIR"
}

# Register Ctrl+C handler
[Console]::TreatControlCAsInput = $false
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Stop-AllServices }

# =============================================================================
# SERVICE LAUNCHER HELPER
# =============================================================================
function Start-ServiceJob {
    param(
        [string]$Label,
        [string]$LogFile,
        [scriptblock]$Command
    )
    $job = Start-Job -Name $Label -ScriptBlock {
        param($cmd, $logFile, $projectDir, $label, $logLevel)
        $env:LOG_LEVEL = $logLevel
        Set-Location $projectDir
        $cmd.InvokeWithContext($null, [psvariable[]]@()) | ForEach-Object {
            $ts   = (Get-Date -Format 'HH:mm:ss')
            $line = "[$ts][$label] $_"
            Write-Output $line
            Add-Content -Path $logFile -Value $line
        }
    } -ArgumentList $Command, $LogFile, $SCRIPT_DIR, $Label, $env:LOG_LEVEL
    return $job
}

# =============================================================================
# START SERVICES (using Start-Process for better Windows compatibility)
# =============================================================================

# Helper: launch a pnpm script in a new window, redirecting output to log file
function Start-PnpmService {
    param(
        [string]$Label,
        [string]$Filter,
        [string]$Script,
        [string]$LogFile,
        [hashtable]$ExtraEnv = @{},
        [string]$Cwd = $SCRIPT_DIR
    )
    Write-Blue $Label

    # Build environment block
    $envBlock = [System.Environment]::GetEnvironmentVariables()
    foreach ($k in $ExtraEnv.Keys) { $envBlock[$k] = $ExtraEnv[$k] }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"
    $psi.Arguments = "/c pnpm --filter `"$Filter`" $Script >> `"$LogFile`" 2>&1"
    $psi.WorkingDirectory = $Cwd
    $psi.UseShellExecute  = $false
    $psi.CreateNoWindow   = $false
    foreach ($k in $ExtraEnv.Keys) { $psi.EnvironmentVariables[$k] = $ExtraEnv[$k] }

    $proc = [System.Diagnostics.Process]::Start($psi)
    return $proc
}

# Start services
Write-Host ""
$BACKEND_PROC = Start-PnpmService `
    -Label "⚙️  Starting Backend (course-gen-platform) on port 3456..." `
    -Filter "course-gen-platform" `
    -Script "dev" `
    -LogFile $BACKEND_LOG `
    -ExtraEnv @{ PORT = "3456" }

$WORKER_PROC = Start-PnpmService `
    -Label "👷 Starting BullMQ Worker (Stages 1-5)..." `
    -Filter "course-gen-platform" `
    -Script "dev:worker" `
    -LogFile $WORKER_LOG

$WORKER_STAGE6_PROC = Start-PnpmService `
    -Label "📝 Starting Stage 6 Worker (lesson content)..." `
    -Filter "course-gen-platform" `
    -Script "dev:worker:stage6" `
    -LogFile $WORKER_STAGE6_LOG

$WORKER_STAGE7_PROC = Start-PnpmService `
    -Label "🎨 Starting Stage 7 Enrichment Worker..." `
    -Filter "course-gen-platform" `
    -Script "dev:worker:stage7" `
    -LogFile $WORKER_STAGE7_LOG

$FRONTEND_PROC = Start-PnpmService `
    -Label "🖥️  Starting Frontend (web, Turbopack)..." `
    -Filter "web" `
    -Script "dev --hostname 0.0.0.0" `
    -LogFile $FRONTEND_LOG `
    -Cwd (Join-Path $SCRIPT_DIR "packages\web")

$global:ServiceProcs = @($BACKEND_PROC, $WORKER_PROC, $WORKER_STAGE6_PROC, $WORKER_STAGE7_PROC, $FRONTEND_PROC)

# =============================================================================
# WAIT FOR FRONTEND AND DETECT PORT
# =============================================================================
Write-Host ""
Write-Yellow "⏳ Waiting for services to start..."

$DETECTED_PORT = ""
for ($i = 0; $i -lt 30; $i++) {
    if (Test-Path $FRONTEND_LOG) {
        $logContent = Get-Content $FRONTEND_LOG -ErrorAction SilentlyContinue
        $portMatch  = $logContent | Select-String -Pattern 'Local:\s+http://localhost:(\d+)' | Select-Object -First 1
        if ($portMatch -and $portMatch.Matches[0].Groups[1].Value) {
            $DETECTED_PORT = $portMatch.Matches[0].Groups[1].Value
            break
        }
    }
    Start-Sleep -Seconds 1
}
if (-not $DETECTED_PORT) { $DETECTED_PORT = "3000" }

# =============================================================================
# OUTPUT STATUS
# =============================================================================
Write-Host ""
Write-Green "✅ All services started!"
Write-Host "   - ⚙️  Backend API:                     http://localhost:3456"
Write-Host "   - 👷 BullMQ Worker (Stages 1-5):      running"
Write-Host "   - 📝 Stage 6 Worker (lesson content): running"
Write-Host "   - 🎨 Stage 7 Worker (enrichments):    running"
Write-Host "   - 🖥️  Frontend:                        http://localhost:${DETECTED_PORT}"
Write-Host "   - 📦 BullMQ UI:                        http://localhost:3456/admin/queues"
Write-Host "   - 🎧 NotebookLM Bridge:               http://127.0.0.1:${NLM_BRIDGE_PORT}"

if ($LOCAL_IP) {
    Write-Host ""
    Write-Blue "🌐 LAN Access (for other devices on your network):"
    Write-Host "   - Frontend: http://${LOCAL_IP}:${DETECTED_PORT}"
    Write-Host "   - Backend:  http://${LOCAL_IP}:3456"
}

Write-Host ""
Write-Blue "📝 Log files:"
Write-Host "   - Backend:  $BACKEND_LOG"
Write-Host "   - Worker:   $WORKER_LOG"
Write-Host "   - Stage 6:  $WORKER_STAGE6_LOG"
Write-Host "   - Stage 7:  $WORKER_STAGE7_LOG"
Write-Host "   - Frontend: $FRONTEND_LOG"
Write-Host "   - Combined: (logs are per-service on Windows)"

Write-Host ""
Write-Yellow "💡 View logs in real-time:"
Write-Host "   Get-Content `"$LOGS_DIR\backend-latest.log`" -Wait"
Write-Host "   Get-Content `"$LOGS_DIR\frontend-latest.log`" -Wait"

Write-Host ""
Write-Yellow "💡 Options:"
Write-Host "   .\start-dev.ps1 -VerboseMode   # Show all logs (trace level)"
Write-Host ""
Write-Yellow "Press Ctrl+C to stop all services."
Write-Host ""

# =============================================================================
# KEEP ALIVE — wait for Ctrl+C
# =============================================================================
try {
    while ($true) {
        # Check if any critical service has crashed
        $crashed = $global:ServiceProcs | Where-Object { $_ -and $_.HasExited }
        if ($crashed) {
            foreach ($p in $crashed) {
                Write-Yellow "⚠️  A service process exited (PID $($p.Id)). Check logs."
            }
            $global:ServiceProcs = $global:ServiceProcs | Where-Object { -not $_.HasExited }
        }
        Start-Sleep -Seconds 5
    }
} finally {
    Stop-AllServices
}
