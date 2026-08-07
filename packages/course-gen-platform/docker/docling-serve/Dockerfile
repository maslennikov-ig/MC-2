# syntax=docker/dockerfile:1.7
FROM ghcr.io/docling-project/docling-serve-cpu:v1.30.0@sha256:061d35c03611bc15b73d024c8e8387bcf0624279f8b57c16c1567326f214ba56

LABEL org.opencontainers.image.title="MegaCampus Docling Serve"
LABEL org.opencontainers.image.version="1.30.0-docling-2.118.0"
LABEL org.opencontainers.image.base.digest="sha256:061d35c03611bc15b73d024c8e8387bcf0624279f8b57c16c1567326f214ba56"

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

# Guards the reason `runtime.py` was deleted here.
#
# Until jobkit 3.3.0 this image carried a wrapper because
# `_parse_standard_pdf_opts` accepted `do_pdf_heading_hierarchy` and then never
# assigned `heading_hierarchy_options`, so the request was silently dropped.
# 3.3.0 wires it, and does one thing the wrapper never did: it turns on
# `generate_parsed_pages` for style-based inference, without which the style
# signal is skipped.
#
# The wrapper is gone, so nothing would notice if a future base image regressed
# to the old behaviour — the API would still accept the field and still ignore
# it, exactly as before, and no test we own would run. Hence this assertion:
# a base bump that loses the passthrough fails the build instead of shipping.
RUN /opt/app-root/bin/python -c "\
import inspect, re; \
import importlib.metadata as m; \
from docling_jobkit.convert.manager import DoclingConverterManager as C; \
v = m.version('docling-jobkit'); \
assert tuple(int(p) for p in v.split('.')[:2]) >= (3, 3), f'docling-jobkit {v} predates the heading-hierarchy fix'; \
src = inspect.getsource(C._parse_standard_pdf_opts); \
assert re.search(r'heading_hierarchy_options\s*=', src), 'upstream stopped assigning heading_hierarchy_options; the wrapper would be needed again'"

USER 1001
RUN HF_HUB_DOWNLOAD_TIMEOUT=120 HF_HUB_ETAG_TIMEOUT=120 \
    docling-tools models download \
      -o /opt/app-root/src/.cache/docling/models \
      --easyocr-lang ru \
      --easyocr-lang en \
      layout tableformer picture_classifier rapidocr easyocr

# `DOCLING_SERVE_PDF_HEADING_HIERARCHY` is deliberately absent: it was the
# wrapper's own service-wide default and upstream has no such setting. Heading
# inference is requested per conversion, which is what `DOCLING_MCP_PDF_HEADING_
# HIERARCHY` on the MCP side sets, so the capability survives on one flag.
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
