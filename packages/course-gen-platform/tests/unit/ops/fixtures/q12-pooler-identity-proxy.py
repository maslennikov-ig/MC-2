#!/usr/bin/env python3
"""Local Postgres-wire TLS front for the Q12 database barrier real-PG17 acceptance (R4C).

The frozen q12-database-barrier.sh `install` command hardcodes the production
connection identity (hostname aws-1-us-east-2.pooler.supabase.com, port 5432,
database postgres, user postgres.<project-ref>) with no test-mode relaxation for
that identity check -- by design, since the barrier's real DB-mutation path must
only ever address the real production database. To drive the REAL, unmodified
barrier against a REAL disposable PostgreSQL 17 source instead of stubbing it, this
fixture terminates the barrier's mandatory SSLRequest+TLS handshake for that exact
identity (self-signed certificate whose SAN matches the frozen hostname; the
barrier's protected test mode already skips the production CA sha256 pin), rewrites
ONLY the "user" field of the wire-protocol StartupMessage from the pooler-style
tenant username to the disposable source's real "postgres" role (mirroring what
Supabase's own production pooler does upstream), and relays every other byte
unmodified into the disposable container via `docker exec` (the docker control
channel, a UNIX socket -- not host TCP networking, so it works unmodified from
inside a private network namespace with no route to the container's bridge). No SQL
is interpreted, generated, or altered here; this is a byte-level identity front end
only. The barrier script itself, and q12-source-manifest.ts, remain byte-untouched.
"""
from __future__ import annotations

import argparse
import selectors
import socket
import ssl
import subprocess
import sys
import threading

SSL_REQUEST_CODE = 80877103  # 0x04D2162F, the fixed libpq SSLRequest magic.


def log(message: str) -> None:
    sys.stderr.write(f"q12-pooler-identity-proxy: {message}\n")
    sys.stderr.flush()


def read_exact(sock: ssl.SSLSocket | socket.socket, size: int) -> bytes:
    buffer = b""
    while len(buffer) < size:
        chunk = sock.recv(size - len(buffer))
        if not chunk:
            raise ConnectionError("peer closed during handshake")
        buffer += chunk
    return buffer


def rewrite_startup_user(raw: bytes, from_user: bytes, to_user: bytes) -> bytes:
    length = int.from_bytes(raw[0:4], "big")
    if length != len(raw):
        raise ValueError("startup message length mismatch")
    body = raw[8:]  # skip length(4) + protocol version(4)
    parts = body.split(b"\x00")
    out_parts: list[bytes] = []
    found = False
    index = 0
    while index < len(parts) - 1:
        key = parts[index]
        if key == b"":
            break
        value = parts[index + 1]
        if key == b"user" and value == from_user:
            value = to_user
            found = True
        out_parts.append(key)
        out_parts.append(value)
        index += 2
    if not found:
        raise ValueError("startup message did not carry the expected pooler-style user")
    new_body = b"\x00".join(out_parts) + b"\x00\x00"
    new_length = 8 + len(new_body)
    return new_length.to_bytes(4, "big") + raw[4:8] + new_body


def handle_client(
    client: socket.socket, cert: str, key: str, container: str, backend_user: str
) -> None:
    proc: subprocess.Popen | None = None
    try:
        client.settimeout(30)
        head = read_exact(client, 8)
        length = int.from_bytes(head[0:4], "big")
        code = int.from_bytes(head[4:8], "big")
        if length != 8 or code != SSL_REQUEST_CODE:
            log(f"rejecting non-SSLRequest opener: length={length} code={code}")
            client.close()
            return
        client.sendall(b"S")
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=cert, keyfile=key)
        tls = context.wrap_socket(client, server_side=True)
        tls.settimeout(30)
        startup_head = read_exact(tls, 4)
        startup_length = int.from_bytes(startup_head, "big")
        startup_rest = read_exact(tls, startup_length - 4)
        startup = startup_head + startup_rest
        rewritten = rewrite_startup_user(
            startup, b"postgres.diqooqbuchsliypgwksu", backend_user.encode("ascii")
        )
        # Bridge into the disposable container's own loopback purely via the docker
        # control channel (unix socket) -- no host network route to the container is
        # required, so this works unchanged from inside an isolated network namespace.
        proc = subprocess.Popen(
            [
                "docker",
                "exec",
                "-i",
                container,
                "bash",
                "-c",
                "exec 3<>/dev/tcp/127.0.0.1/5432\n"
                "cat <&3 &\n"
                "readpid=$!\n"
                "cat >&3\n"
                'kill "$readpid" 2>/dev/null\n'
                'wait "$readpid" 2>/dev/null\n'
                "true\n",
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            bufsize=0,
        )
        assert proc.stdin is not None and proc.stdout is not None
        proc.stdin.write(rewritten)
        proc.stdin.flush()

        def pump_backend_to_client() -> None:
            try:
                while True:
                    chunk = proc.stdout.read(65536)
                    if not chunk:
                        return
                    tls.sendall(chunk)
            except OSError:
                return

        def pump_client_to_backend() -> None:
            try:
                while True:
                    chunk = tls.recv(65536)
                    if not chunk:
                        return
                    proc.stdin.write(chunk)
                    proc.stdin.flush()
            except OSError:
                return
            finally:
                try:
                    proc.stdin.close()
                except OSError:
                    pass

        forward = threading.Thread(target=pump_backend_to_client, daemon=True)
        backward = threading.Thread(target=pump_client_to_backend, daemon=True)
        forward.start()
        backward.start()
        forward.join()
        backward.join()
    except Exception as exc:  # noqa: BLE001 -- best-effort diagnostic for a test fixture.
        log(f"client session error: {exc}")
    finally:
        if proc is not None:
            try:
                proc.wait(timeout=10)
            except Exception:  # noqa: BLE001
                proc.kill()
        try:
            client.close()
        except OSError:
            pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--listen-host", default="127.0.0.1")
    parser.add_argument("--listen-port", type=int, default=5432)
    parser.add_argument("--cert", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--container", required=True)
    parser.add_argument("--backend-user", default="postgres")
    parser.add_argument("--ready-file", required=True)
    args = parser.parse_args()

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((args.listen_host, args.listen_port))
    server.listen(16)
    with open(args.ready_file, "w", encoding="utf-8") as handle:
        handle.write("ready\n")

    while True:
        client, _ = server.accept()
        threading.Thread(
            target=handle_client,
            args=(client, args.cert, args.key, args.container, args.backend_user),
            daemon=True,
        ).start()


if __name__ == "__main__":
    raise SystemExit(main())
