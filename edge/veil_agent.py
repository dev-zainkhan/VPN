#!/usr/bin/env python3
"""Veil edge agent. Python 3.12 standard library only."""
import hashlib
import ipaddress
import json
import os
import re
import ssl
import subprocess
import time
import urllib.error
import urllib.request

VERSION = "1.0.0"
CONFIG_PATH = "/etc/veil/agent.json"
TOKEN_PATH = "/etc/veil/agent_token"
WG_PUB_PATH = "/etc/wireguard/server.pub"
CERT_PATH = "/etc/veil/tls/cert.pem"
WG_IFACE = "wg0"
TUNNEL_NET = ipaddress.ip_network("10.66.0.0/16")
SERVER_TUNNEL_IP = "10.66.0.1"
KEY_RE = re.compile(r"^[A-Za-z0-9+/]{43}=$")
IMDS = "http://169.254.169.254"
POLL_SECONDS = 2
REPORT_SECONDS = 60


def log(msg):
    print(f"veil-agent: {msg}", flush=True)


def http(method, url, body=None, headers=None, timeout=10):
    hdrs = {"User-Agent": f"veil-agent/{VERSION}"}
    if headers:
        hdrs.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, None


def imds(path):
    req = urllib.request.Request(IMDS + "/latest/api/token", method="PUT",
                                 headers={"X-aws-ec2-metadata-token-ttl-seconds": "300"})
    with urllib.request.urlopen(req, timeout=5) as r:
        token = r.read().decode()
    req = urllib.request.Request(IMDS + "/latest/meta-data/" + path,
                                 headers={"X-aws-ec2-metadata-token": token})
    with urllib.request.urlopen(req, timeout=5) as r:
        return r.read().decode().strip()


def read_text(path):
    with open(path) as f:
        return f.read().strip()


def cert_sha256():
    der = ssl.PEM_cert_to_DER_cert(read_text(CERT_PATH) + "\n")
    return hashlib.sha256(der).hexdigest()


def register(cfg):
    delay = 5
    while True:
        try:
            body = {
                "serverId": cfg["serverId"],
                "bootstrapToken": cfg["bootstrapToken"],
                "instanceId": imds("instance-id"),
                "publicIp": imds("public-ipv4"),
                "wgPublicKey": read_text(WG_PUB_PATH),
                "tcpCertSha256": cert_sha256(),
                "agentVersion": VERSION,
            }
            status, data = http("POST", cfg["apiBase"] + "/api/agent/v1/register", body)
            if status == 200 and data and "agentToken" in data:
                fd = os.open(TOKEN_PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(fd, "w") as f:
                    f.write(data["agentToken"])
                log("registered")
                return data["agentToken"]
            log(f"register failed with HTTP {status}")
        except Exception as e:
            log(f"register error: {e}")
        time.sleep(delay)
        delay = min(delay * 2, 60)


def wg(*args):
    return subprocess.run(["wg", *args], check=True, capture_output=True, text=True).stdout


def current_peers():
    lines = wg("show", WG_IFACE, "dump").strip().splitlines()
    peers = {}
    for line in lines[1:]:
        f = line.split("\t")
        if len(f) < 8:
            continue
        ip = f[3].split("/")[0] if f[3] and f[3] != "(none)" else None
        peers[f[0]] = {"ip": ip, "latestHandshake": int(f[4]), "rx": int(f[5]), "tx": int(f[6])}
    return peers


def parse_desired(peers):
    desired = {}
    for p in peers:
        pk = str(p.get("publicKey", ""))
        try:
            addr = ipaddress.ip_address(str(p.get("tunnelIp", "")))
        except ValueError:
            continue
        if KEY_RE.match(pk) and addr in TUNNEL_NET and str(addr) != SERVER_TUNNEL_IP:
            desired[pk] = str(addr)
    return desired


def reconcile(desired):
    current = current_peers()
    for pk, info in current.items():
        if pk not in desired or desired[pk] != info["ip"]:
            wg("set", WG_IFACE, "peer", pk, "remove")
    for pk, ip in desired.items():
        if pk not in current or current[pk]["ip"] != ip:
            wg("set", WG_IFACE, "peer", pk, "allowed-ips", f"{ip}/32")


def default_iface():
    out = subprocess.run(["ip", "-4", "route", "show", "default"],
                         capture_output=True, text=True).stdout.split()
    return out[out.index("dev") + 1] if "dev" in out else None


def net_tx_bytes(iface):
    if not iface:
        return 0
    with open("/proc/net/dev") as f:
        for line in f:
            if line.strip().startswith(iface + ":"):
                return int(line.split(":", 1)[1].split()[8])
    return 0


def cpu_times():
    with open("/proc/stat") as f:
        parts = [int(x) for x in f.readline().split()[1:]]
    return sum(parts), parts[3] + parts[4]


def mem_pct():
    info = {}
    with open("/proc/meminfo") as f:
        for line in f:
            key, value = line.split(":", 1)
            info[key] = int(value.split()[0])
    return round(100.0 * (1 - info["MemAvailable"] / info["MemTotal"]), 1)


def uptime_seconds():
    with open("/proc/uptime") as f:
        return int(float(f.read().split()[0]))


def main():
    with open(CONFIG_PATH) as f:
        cfg = json.load(f)
    token = read_text(TOKEN_PATH) if os.path.exists(TOKEN_PATH) else register(cfg)
    auth = {"Authorization": f"Bearer {token}"}
    base = cfg["apiBase"] + "/api/agent/v1"
    iface = default_iface()
    applied = 0
    last_report = 0.0
    prev_cpu = cpu_times()
    while True:
        try:
            status, data = http("GET", base + "/peers", headers={**auth, "If-None-Match": f'"{applied}"'})
            if status == 200 and data is not None:
                reconcile(parse_desired(data.get("peers", [])))
                applied = int(data["version"])
            elif status == 401:
                log("agent token rejected; this server is being removed")
                time.sleep(300)
                continue
            now = time.time()
            if now - last_report >= REPORT_SECONDS:
                iface = iface or default_iface()
                total, idle = cpu_times()
                dt, di = total - prev_cpu[0], idle - prev_cpu[1]
                prev_cpu = (total, idle)
                cpu = round(100.0 * (1 - di / dt), 1) if dt > 0 else 0.0
                peers = [{"publicKey": pk, "latestHandshake": p["latestHandshake"],
                          "rxBytes": p["rx"], "txBytes": p["tx"]}
                         for pk, p in current_peers().items()]
                body = {"appliedVersion": applied, "peers": peers, "cpuPct": max(0.0, min(cpu, 100.0)),
                        "memPct": mem_pct(), "netTxBytes": net_tx_bytes(iface),
                        "uptimeSeconds": uptime_seconds()}
                status, _ = http("POST", base + "/report", body, auth, timeout=20)
                if status == 200:
                    last_report = now
                else:
                    log(f"report failed with HTTP {status}")
                    last_report = now - REPORT_SECONDS + 10
        except Exception as e:
            log(f"loop error: {e}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
