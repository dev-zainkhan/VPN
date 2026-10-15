package expo.modules.veilvpn

import android.util.Log
import java.io.DataInputStream
import java.io.OutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.SocketAddress
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * TCP mode (spec 11.5): WireGuard sends UDP to 127.0.0.1:[localPort]; each datagram goes to the
 * server inside one TLS connection on [port] as a 2-byte length + payload frame, and replies come
 * back the same way. The server certificate is accepted only if its SHA-256 matches [certSha256].
 * The server IP is left out of the tunnel's allowed IPs, so this socket bypasses the VPN.
 */
class TcpForwarder(
  private val host: String,
  private val port: Int,
  private val certSha256: String,
  private val localPort: Int,
  private val onFatal: (String) -> Unit,
) {
  @Volatile private var running = false
  @Volatile private var tls: SSLSocket? = null
  @Volatile private var localPeer: SocketAddress? = null
  private var udp: DatagramSocket? = null
  private var thread: Thread? = null

  fun start() {
    running = true
    val socket = DatagramSocket(InetSocketAddress(InetAddress.getByName("127.0.0.1"), localPort))
    udp = socket
    thread = Thread({ connectLoop(socket) }, "veil-tcp-forwarder").apply { isDaemon = true; start() }
  }

  fun stop() {
    running = false
    try { tls?.close() } catch (_: Exception) {}
    try { udp?.close() } catch (_: Exception) {}
    thread?.interrupt()
  }

  private fun connectLoop(socket: DatagramSocket) {
    var delayMs = 1000L
    while (running) {
      try {
        val conn = openTls()
        tls = conn
        delayMs = 1000L
        val out = conn.outputStream
        val pump = Thread({ udpToTls(socket, out) }, "veil-udp-to-tls").apply { isDaemon = true; start() }
        tlsToUdp(socket, DataInputStream(conn.inputStream))
        pump.interrupt()
      } catch (e: PinMismatch) {
        onFatal("Server certificate does not match")
        running = false
      } catch (e: Exception) {
        if (running) Log.w(TAG, "connection lost: ${e.message}")
      } finally {
        try { tls?.close() } catch (_: Exception) {}
        tls = null
      }
      if (running) {
        try { Thread.sleep(delayMs) } catch (_: InterruptedException) { return }
        delayMs = minOf(delayMs * 2, 15000L)
      }
    }
  }

  private fun openTls(): SSLSocket {
    // No certificate authority is trusted; the pin below is the only check.
    val trustAll = object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
      override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
      override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
    }
    val ctx = SSLContext.getInstance("TLS")
    ctx.init(null, arrayOf<TrustManager>(trustAll), SecureRandom())
    val sock = ctx.socketFactory.createSocket() as SSLSocket
    sock.connect(InetSocketAddress(host, port), 10000)
    sock.soTimeout = 0
    sock.tcpNoDelay = true
    sock.startHandshake()
    val cert = sock.session.peerCertificates.firstOrNull() ?: throw PinMismatch()
    val sha = MessageDigest.getInstance("SHA-256").digest(cert.encoded).joinToString("") { "%02x".format(it) }
    if (sha != certSha256.lowercase()) {
      sock.close()
      throw PinMismatch()
    }
    return sock
  }

  private fun udpToTls(socket: DatagramSocket, out: OutputStream) {
    val buf = ByteArray(MAX_FRAME)
    val frame = ByteArray(MAX_FRAME + 2)
    try {
      while (running && !Thread.currentThread().isInterrupted) {
        val packet = DatagramPacket(buf, buf.size)
        socket.receive(packet)
        localPeer = packet.socketAddress
        val n = packet.length
        if (n <= 0 || n > MAX_FRAME) continue
        frame[0] = (n shr 8).toByte()
        frame[1] = (n and 0xff).toByte()
        System.arraycopy(buf, 0, frame, 2, n)
        synchronized(out) { out.write(frame, 0, n + 2); out.flush() }
      }
    } catch (_: Exception) {
      try { tls?.close() } catch (_: Exception) {}
    }
  }

  private fun tlsToUdp(socket: DatagramSocket, input: DataInputStream) {
    val buf = ByteArray(MAX_FRAME)
    while (running) {
      val n = input.readUnsignedShort()
      if (n == 0 || n > MAX_FRAME) throw IllegalStateException("bad frame")
      input.readFully(buf, 0, n)
      val peer = localPeer ?: continue
      socket.send(DatagramPacket(buf, n, peer))
    }
  }

  private class PinMismatch : Exception()

  companion object {
    private const val TAG = "VeilTcpForwarder"
    private const val MAX_FRAME = 1500
  }
}
