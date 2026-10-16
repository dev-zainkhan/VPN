package expo.modules.veilvpn

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.VpnService
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import com.wireguard.config.InetEndpoint
import com.wireguard.config.InetNetwork
import com.wireguard.config.Interface
import com.wireguard.config.Peer
import com.wireguard.crypto.Key
import com.wireguard.crypto.KeyPair
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.security.MessageDigest

class VeilVpnModule : Module() {
  private var backend: GoBackend? = null
  private var forwarder: TcpForwarder? = null
  private var peerKey: Key? = null
  private var permissionPromise: Promise? = null

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not ready" }

  private val tunnel = object : Tunnel {
    override fun getName(): String = "veil"
    override fun onStateChange(newState: Tunnel.State) {
      sendEvent("onStateChange", mapOf("state" to if (newState == Tunnel.State.UP) "up" else "down"))
    }
  }

  private fun backend(): GoBackend = backend ?: GoBackend(context.applicationContext).also { backend = it }

  override fun definition() = ModuleDefinition {
    Name("VeilVpn")
    Events("onStateChange")

    // A new WireGuard key pair. The private key never leaves the phone.
    Function("generateKeyPair") {
      val pair = KeyPair()
      mapOf("publicKey" to pair.publicKey.toBase64(), "privateKey" to pair.privateKey.toBase64())
    }

    Function("publicKeyFor") { privateKey: String ->
      KeyPair(Key.fromBase64(privateKey)).publicKey.toBase64()
    }

    // "wifi", "cellular", "other" or "none": the network under the VPN, so Auto mode can remember
    // what works on each (mobile networks often block WireGuard over UDP).
    Function("networkType") {
      val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      @Suppress("DEPRECATION")
      val caps = cm.allNetworks
        .mapNotNull { cm.getNetworkCapabilities(it) }
        .filter { !it.hasTransport(NetworkCapabilities.TRANSPORT_VPN) && it.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) }
        .sortedByDescending { it.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) }
        .firstOrNull()
      when {
        caps == null -> "none"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "wifi"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
        else -> "other"
      }
    }

    Function("sha256Hex") { text: String ->
      MessageDigest.getInstance("SHA-256").digest(text.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }

    // Asks Android for VPN permission once; resolves true when granted.
    AsyncFunction("prepare") { promise: Promise ->
      val intent: Intent? = VpnService.prepare(context)
      if (intent == null) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "The app is not in the foreground", null)
        return@AsyncFunction
      }
      permissionPromise = promise
      activity.startActivityForResult(intent, PERMISSION_REQUEST)
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode == PERMISSION_REQUEST) {
        permissionPromise?.resolve(payload.resultCode == Activity.RESULT_OK)
        permissionPromise = null
      }
    }

    // Brings the tunnel up with the config from POST /api/v1/connect (spec 8.6).
    AsyncFunction("connect") { cfg: Map<String, Any?> ->
      stopForwarder()
      val tcp = cfg["tcp"] as? Map<*, *>
      if (tcp != null) {
        val fwd = TcpForwarder(
          host = tcp["host"] as String,
          port = (tcp["port"] as Number).toInt(),
          certSha256 = tcp["certSha256"] as String,
          localPort = (cfg["localPort"] as? Number)?.toInt() ?: 51821,
          onFatal = { message -> sendEvent("onStateChange", mapOf("state" to "error", "message" to message)) },
        )
        fwd.start()
        forwarder = fwd
      }

      val iface = Interface.Builder()
        .setKeyPair(KeyPair(Key.fromBase64(cfg["privateKey"] as String)))
        .addAddress(InetNetwork.parse(cfg["address"] as String))
        .setMtu((cfg["mtu"] as Number).toInt())
      for (dns in cfg["dns"] as List<*>) iface.addDnsServer(InetAddress.getByName(dns as String))
      // Our own traffic to the API keeps working while the tunnel restarts.
      iface.excludeApplication(context.packageName)

      val key = Key.fromBase64(cfg["peerPublicKey"] as String)
      val peer = Peer.Builder()
        .setPublicKey(key)
        .setEndpoint(InetEndpoint.parse(cfg["endpoint"] as String))
        .setPersistentKeepalive((cfg["persistentKeepalive"] as Number).toInt())
      for (ip in cfg["allowedIps"] as List<*>) peer.addAllowedIp(InetNetwork.parse(ip as String))

      val config = Config.Builder().setInterface(iface.build()).addPeer(peer.build()).build()
      try {
        backend().setState(tunnel, Tunnel.State.UP, config)
      } catch (e: Exception) {
        stopForwarder()
        throw e
      }
      peerKey = key
      true
    }

    AsyncFunction("disconnect") {
      try {
        backend?.setState(tunnel, Tunnel.State.DOWN, null)
      } finally {
        stopForwarder()
        peerKey = null
      }
      true
    }

    Function("getState") {
      val state = backend?.getState(tunnel) ?: Tunnel.State.DOWN
      if (state == Tunnel.State.UP) "up" else "down"
    }

    // Latest handshake and traffic for the server peer; handshake 0 means none yet.
    AsyncFunction("getStats") {
      val b = backend
      val key = peerKey
      if (b == null || key == null) return@AsyncFunction mapOf("latestHandshakeMs" to 0.0, "rxBytes" to 0.0, "txBytes" to 0.0)
      val stats = try { b.getStatistics(tunnel).peer(key) } catch (_: Exception) { null }
      if (stats == null) return@AsyncFunction mapOf("latestHandshakeMs" to 0.0, "rxBytes" to 0.0, "txBytes" to 0.0)
      mapOf(
        "latestHandshakeMs" to readLong(stats, "latestHandshakeEpochMillis").toDouble(),
        "rxBytes" to readLong(stats, "rxBytes").toDouble(),
        "txBytes" to readLong(stats, "txBytes").toDouble(),
      )
    }

    // Time to open a TCP connection, in ms; -1 when unreachable. Used for the ping column.
    AsyncFunction("tcpPing") { host: String, port: Int ->
      val start = System.nanoTime()
      try {
        Socket().use { it.connect(InetSocketAddress(host, port), 3000) }
        ((System.nanoTime() - start) / 1_000_000).toInt()
      } catch (_: Exception) {
        -1
      }
    }
  }

  private fun stopForwarder() {
    forwarder?.stop()
    forwarder = null
  }

  // PeerStats is a record in newer library versions and a plain class in older ones.
  private fun readLong(target: Any, name: String): Long =
    try {
      (target.javaClass.getMethod(name).invoke(target) as Number).toLong()
    } catch (_: NoSuchMethodException) {
      (target.javaClass.getField(name).get(target) as Number).toLong()
    }

  companion object {
    private const val PERMISSION_REQUEST = 51820
  }
}
