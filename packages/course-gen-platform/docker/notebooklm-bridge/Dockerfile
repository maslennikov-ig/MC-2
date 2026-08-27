FROM python:3.12-slim

LABEL maintainer="MegaCampusAI Team"
LABEL description="NotebookLM Bridge service for audio/video generation"
LABEL version="1.0.0"

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

# `http.client`, not `urllib.request`, and the difference is the whole check.
#
# This container is given HTTP_PROXY=socks5h://... so NotebookLM traffic takes
# the geo-bypass hop. `urllib.request.urlopen` reads that variable and routes
# even a loopback request through the SOCKS proxy, which answers with
# `URLError: [Errno 111] Connection refused` — measured inside the production
# container. So this line, correct in intent, could never have run, and both
# compose files replaced it with a bare TCP connect that proves only that
# uvicorn bound the port. `/health` knows about auth_file, proxy, auth_expiry
# and master_token; a socket knows about none of them, which is how the cookies
# stayed dead behind `Up (healthy)` from 2026-03-31 to 2026-08-22 (mc2-h6nlv).
#
# `http.client` opens the connection itself and never consults the environment.
# Liveness only: a 200 means the app is serving. `status: "degraded"` is
# deliberately not a failure here — restarting the container cannot renew a
# cookie or revive a tunnel, so failing on it buys a restart loop instead of a
# repair. That judgement belongs to `scripts/nlm-preflight.sh`, which refuses to
# start a paid generation against a degraded bridge.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD python -c "import http.client, sys; c = http.client.HTTPConnection('127.0.0.1', 8000, timeout=5); c.request('GET', '/health'); sys.exit(0 if c.getresponse().status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
