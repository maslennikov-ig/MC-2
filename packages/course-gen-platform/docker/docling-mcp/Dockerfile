# syntax=docker/dockerfile:1.7
FROM python:3.12-slim@sha256:9e869b0816f5537709825b49e62dc86d1c2691eff19b05c1d4dc3a07992cc052

LABEL org.opencontainers.image.title="MegaCampus Docling MCP"
LABEL org.opencontainers.image.version="3.0.0-docling-2.118.0"
LABEL org.opencontainers.image.source="https://github.com/maslennikov-ig/mc-2"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    CACHE_DIR=/app/docling-json-cache \
    DOCLING_MCP_CONVERSION_MODE=remote \
    DOCLING_MCP_SERVICE_TIMEOUT=1200.0 \
    DOCLING_MCP_SERVICE_MAX_RETRIES=2 \
    DOCLING_MCP_FALLBACK_TO_LOCAL=false \
    DOCLING_MCP_KEEP_IMAGES=false \
    DOCLING_MCP_IMAGES_SCALE=2.0 \
    DOCLING_MCP_DO_OCR=true \
    DOCLING_MCP_OCR_PRESET=easyocr \
    DOCLING_MCP_OCR_LANG=ru,en \
    DOCLING_MCP_DO_TABLE_STRUCTURE=true

WORKDIR /app

COPY requirements.lock /tmp/requirements.lock
RUN python -m pip install --no-cache-dir --require-hashes -r /tmp/requirements.lock \
    && python -m pip check \
    && python -c "import importlib.metadata as m; assert m.version('docling-mcp') == '3.0.0'; assert m.version('mcp') == '2.0.0'; assert m.version('docling-slim') == '2.118.0'; assert m.version('docling-core') == '2.90.0'" \
    && rm /tmp/requirements.lock \
    && groupadd --gid 1001 app \
    && useradd --uid 1001 --gid 1001 --create-home app \
    && mkdir -p /app/uploads /app/uploads-dev /app/docling-json-cache \
    && chown -R 1001:1001 /app

COPY runtime.py test_runtime.py /app/
RUN python -m unittest -v test_runtime.py \
    && rm /app/test_runtime.py \
    && DOCLING_MCP_SERVICE_URL=http://docling-serve:5001 python -c "import runtime; runtime.apply_service_client_settings(); from docling_mcp.tools.converters.remote import RemoteDocumentConverter; c = RemoteDocumentConverter().client; assert c._job_timeout == 1200.0; assert c._http_retries == 2"

USER 1001:1001
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python -c "import socket; s=socket.create_connection(('127.0.0.1', 8000), 5); s.close()"

CMD ["python", "/app/runtime.py", "--transport", "streamable-http", "--host", "0.0.0.0", "--port", "8000", "conversion", "generation"]
