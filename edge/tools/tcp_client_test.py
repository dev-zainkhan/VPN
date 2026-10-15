#!/usr/bin/env python3
"""Test client for veil-tcpgw.
Usage: python3 tcp_client_test.py --host 3.121.48.207 --cert-sha256 <64 hex> [--listen 51821]"""
import argparse
import asyncio
import hashlib
import ssl
import struct


class LocalUdp(asyncio.DatagramProtocol):
    def __init__(self):
        self.peer = None
        self.writer = None

    def datagram_received(self, data, addr):
        self.peer = addr
        if self.writer is not None and not self.writer.is_closing():
            self.writer.write(struct.pack("!H", len(data)) + data)


async def run(host, fingerprint, listen_port):
    loop = asyncio.get_running_loop()
    udp, local = await loop.create_datagram_endpoint(LocalUdp, local_addr=("127.0.0.1", listen_port))
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    ctx.minimum_version = ssl.TLSVersion.TLSv1_3
    delay = 1
    while True:
        try:
            reader, writer = await asyncio.open_connection(host, 443, ssl=ctx, server_hostname="veil-edge")
            der = writer.get_extra_info("ssl_object").getpeercert(binary_form=True)
            if hashlib.sha256(der).hexdigest() != fingerprint.lower():
                print("certificate fingerprint mismatch; refusing to send traffic")
                writer.close()
                return
            print("connected")
            delay = 1
            local.writer = writer
            while True:
                (length,) = struct.unpack("!H", await reader.readexactly(2))
                payload = await reader.readexactly(length)
                if local.peer is not None:
                    udp.sendto(payload, local.peer)
        except (OSError, asyncio.IncompleteReadError, ssl.SSLError) as e:
            print(f"connection lost: {e}; retrying in {delay}s")
        local.writer = None
        await asyncio.sleep(delay)
        delay = min(delay * 2, 15)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True)
    ap.add_argument("--cert-sha256", required=True)
    ap.add_argument("--listen", type=int, default=51821)
    a = ap.parse_args()
    asyncio.run(run(a.host, a.cert_sha256, a.listen))
