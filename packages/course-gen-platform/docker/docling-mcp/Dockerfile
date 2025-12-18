# Docling MCP Server Dockerfile
# Base: Python 3.12 slim for optimal compatibility
FROM python:3.12-slim

# Metadata
LABEL maintainer="MegaCampusAI Team"
LABEL description="Docling MCP Server for document processing"
LABEL version="1.0.0"

# Set working directory
WORKDIR /app

# Install system dependencies required by Docling
# - libgl1: OpenGL support for image processing (replaces deprecated libgl1-mesa-glx)
# - libglib2.0-0: GLib library for low-level utilities
# - curl: For health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Upgrade pip and install docling-mcp
# Using --no-cache-dir to reduce image size
# Note: MCP SDK DNS rebinding protection is bypassed via nginx proxy (see docker-compose.production.yml)
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir "mcp[cli]>=1.24.3" && \
    pip install --no-cache-dir "docling-mcp>=1.3.2"

# Environment variables
ENV DOCLING_CACHE_DIR=/app/cache \
    DOCLING_MODELS_PATH=/app/models \
    DOCLING_LOG_LEVEL=INFO \
    DOCLING_MAX_FILE_SIZE=104857600 \
    DOCLING_TIMEOUT=300 \
    MCP_TRANSPORT=streamable-http \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=8000 \
    PYTHONUNBUFFERED=1

# Create necessary directories
RUN mkdir -p /app/cache /app/models /app/uploads

# Health check endpoint
# Checks if the server is responding on port 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Expose port for streamable-http transport
EXPOSE 8000

# Run MCP server with streamable-http transport
CMD ["docling-mcp-server", "--transport", "streamable-http", "--host", "0.0.0.0", "--port", "8000"]
