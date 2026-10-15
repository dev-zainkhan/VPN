#!/usr/bin/env python3
"""Veil TCP gateway: WireGuard datagrams inside TLS on TCP 443. Python 3.12 standard library only."""
import asyncio
import os
import ssl
import struct

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 443
WG_ADDR = ("127.0.0.1", 51820)
MAX_FRAME = 1500
IDLE_SECONDS = 180
MAX_CONNECTIONS = 1000
MAX_BUFFER = 1024 * 1024

active = 0


class UdpSide(asyncio.DatagramProtocol):
    def __init__(self, writer, touch):
        self.writer = writer
        self.touch = touch

    def datagram_received(self, data, addr):
        if self.writer.is_closing():
            return
        if self.writer.transport.get_write_buffer_size() > MAX_BUFFER:
            return  # drop the packet, as UDP would
        self.writer.write(struct.pack("!H", len(data)) + data)
        self.touch()


async def watchdog(writer, last, loop):
    while not writer.is_closing():
        await asyncio.sleep(10)
        if loop.time() - last[0] > IDLE_SECONDS:
            writer.close()
            return


async def handle(reader, writer):
    global active
    if active >= MAX_CONNECTIONS:
        writer.close()
        return
    active += 1
    loop = asyncio.get_running_loop()
    last = [loop.time()]

    def touch():
        last[0] = loop.time()

    transport = None
    wd = asyncio.create_task(watchdog(writer, last, loop))
    try:
        transport, _ = await loop.create_datagram_endpoint(lambda: UdpSide(writer, touch), remote_addr=WG_ADDR)
        while True:
            (length,) = struct.unpack("!H", await reader.readexactly(2))
            if length == 0 or length > MAX_FRAME:
                break
            payload = await reader.readexactly(length)
            transport.sendto(payload)
            touch()
    except (asyncio.IncompleteReadError, ConnectionError, ssl.SSLError, OSError):
        pass
    finally:
        active -= 1
        wd.cancel()
        if transport is not None:
            transport.close()
        writer.close()


def make_context():
    creds = os.environ.get("CREDENTIALS_DIRECTORY", "/etc/veil/tls")
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_3
    ctx.load_cert_chain(os.path.join(creds, "cert.pem"), os.path.join(creds, "key.pem"))
    return ctx


async def main():
    server = await asyncio.start_server(handle, LISTEN_HOST, LISTEN_PORT, ssl=make_context(),
                                        ssl_handshake_timeout=15, backlog=512)
    print("veil-tcpgw: listening on 443", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
