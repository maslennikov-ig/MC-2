# syntax=docker/dockerfile:1.7
FROM ghcr.io/docling-project/docling-serve-cpu:v1.29.0@sha256:51c18e0e0fec8a13ab858f03d5e9a140178d8d95962400553cb2644ad5ee84da

LABEL org.opencontainers.image.title="MegaCampus Docling Serve"
LABEL org.opencontainers.image.version="1.29.0-docling-2.118.0"
LABEL org.opencontainers.image.base.digest="sha256:51c18e0e0fec8a13ab858f03d5e9a140178d8d95962400553cb2644ad5ee84da"

USER 0
COPY requirements.lock /tmp/requirements.lock
RUN /opt/app-root/bin/pip install --no-cache-dir --no-deps --require-hashes \
      -r /tmp/requirements.lock \
    && /opt/app-root/bin/pip check \
    && /opt/app-root/bin/python -c "import importlib.metadata as m; assert m.version('docling-slim') == '2.118.0'; assert m.version('docling-core') == '2.90.0'" \
    && rm /tmp/requirements.lock \
    && rm -rf /opt/app-root/src/.cache/docling/models \
    && mkdir -p /opt/app-root/src/.cache/docling/models \
    && chown -R 1001:0 /opt/app-root/src/.cache/docling

USER 1001
RUN HF_HUB_DOWNLOAD_TIMEOUT=120 HF_HUB_ETAG_TIMEOUT=120 \
    docling-tools models download \
      -o /opt/app-root/src/.cache/docling/models \
      --easyocr-lang ru \
      --easyocr-lang en \
      layout tableformer picture_classifier rapidocr easyocr

ENV UVICORN_HOST=0.0.0.0 \
    UVICORN_PORT=5001 \
    UVICORN_WORKERS=1 \
    DOCLING_SERVE_MAX_SYNC_WAIT=1200 \
    DOCLING_SERVE_MAX_DOCUMENT_TIMEOUT=1200 \
    DOCLING_SERVE_LOAD_MODELS_AT_BOOT=true \
    DOCLING_SERVE_ARTIFACTS_PATH=/opt/app-root/src/.cache/docling/models

EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
  CMD python -c "import urllib.request; r=urllib.request.urlopen('http://127.0.0.1:5001/readyz', timeout=5); raise SystemExit(0 if r.status == 200 else 1)"

CMD ["docling-serve", "run"]
