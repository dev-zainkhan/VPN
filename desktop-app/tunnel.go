package main

import (
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
	"golang.zx2c4.com/wireguard/windows/driver"
	"golang.zx2c4.com/wireguard/windows/tunnel"
)

// The tunnel runs in a Windows service, the way the official WireGuard app does it
// (wireguard-windows "embeddable" mode): the service is this program started with /service,
// and the wireguard-nt driver (wireguard.dll next to the program) carries the traffic.
const tunnelName = "Raaz"

var serviceName = "WireGuardTunnel$" + tunnelName

// Local networks stay outside the tunnel so printers, the router and file shares keep working.
var localRanges = []string{"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "127.0.0.0/8"}

func dataDir() string {
	return filepath.Join(os.Getenv("ProgramData"), "RaazVPN")
}

// Only SYSTEM and Administrators can read the folder that holds the tunnel config (it has the private key).
func ensureDataDir() error {
	dir := dataDir()
	sd, err := windows.SecurityDescriptorFromString("O:BAD:PAI(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)")
	if err != nil {
		return err
	}
	sa := &windows.SecurityAttributes{SecurityDescriptor: sd}
	sa.Length = uint32(unsafe.Sizeof(*sa))
	p, _ := windows.UTF16PtrFromString(dir)
	if err := windows.CreateDirectory(p, sa); err != nil && !errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
		return err
	}
	dacl, _, err := sd.DACL()
	if err == nil {
		_ = windows.SetNamedSecurityInfo(dir, windows.SE_FILE_OBJECT,
			windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION, nil, nil, dacl, nil)
	}
	return nil
}

type tunnelPlan struct {
	conf   string
	tcpArg string
}

// Builds the WireGuard config. Kill switch: a 0.0.0.0/0 route makes wireguard-windows block
// everything outside the tunnel, which only works when the server is reached directly (UDP).
func buildTunnel(c *ConnectResponse, privateKey string, protocol string, killSwitch bool, localPort int) (*tunnelPlan, error) {
	wg := c.WireGuard
	address := wg.Address
	if !strings.Contains(address, "/") {
		address += "/32"
	}
	endpoint := wg.Peer.Endpoint
	excluded := append([]string{}, localRanges...)
	plan := &tunnelPlan{}
	if protocol == "tcp" {
		if c.TCP == nil {
			return nil, errors.New("the server did not offer TCP mode")
		}
		ip := net.ParseIP(c.TCP.Host)
		if ip == nil || ip.To4() == nil {
			addrs, err := net.LookupIP(c.TCP.Host)
			if err != nil || len(addrs) == 0 {
				return nil, fmt.Errorf("cannot resolve %s", c.TCP.Host)
			}
			ip = addrs[0]
		}
		// The forwarder's own connection to the server must not go into the tunnel.
		excluded = append(excluded, ip.String()+"/32")
		endpoint = fmt.Sprintf("127.0.0.1:%d", localPort)
		plan.tcpArg = fmt.Sprintf("--tcp=%s,%d,%s,%d", ip.String(), c.TCP.Port, strings.ToLower(c.TCP.CertSha256), localPort)
	}

	var allowed []string
	everything := false
	for _, a := range wg.Peer.AllowedIPs {
		if a == "0.0.0.0/0" {
			everything = true
		}
	}
	switch {
	case !everything:
		allowed = wg.Peer.AllowedIPs
	case killSwitch && protocol == "udp":
		allowed = []string{"0.0.0.0/0", "::/0"}
	default:
		// IPv6 goes into the tunnel too (and is dropped there) so it cannot leak around the VPN;
		// two /1 halves instead of ::/0 so the kill-switch firewall stays off.
		allowed = append(ipv4Except(excluded), "::/1", "8000::/1")
	}

	mtu := wg.MTU
	if mtu == 0 {
		mtu = 1280
	}
	var b strings.Builder
	b.WriteString("[Interface]\n")
	fmt.Fprintf(&b, "PrivateKey = %s\n", privateKey)
	fmt.Fprintf(&b, "Address = %s\n", address)
	if len(wg.DNS) > 0 {
		fmt.Fprintf(&b, "DNS = %s\n", strings.Join(wg.DNS, ", "))
	}
	fmt.Fprintf(&b, "MTU = %d\n\n", mtu)
	b.WriteString("[Peer]\n")
	fmt.Fprintf(&b, "PublicKey = %s\n", wg.Peer.PublicKey)
	fmt.Fprintf(&b, "Endpoint = %s\n", endpoint)
	fmt.Fprintf(&b, "AllowedIPs = %s\n", strings.Join(allowed, ", "))
	if wg.Peer.PersistentKeepalive > 0 {
		fmt.Fprintf(&b, "PersistentKeepalive = %d\n", wg.Peer.PersistentKeepalive)
	}
	plan.conf = b.String()
	return plan, nil
}

// 0.0.0.0/0 minus the given ranges, as CIDR blocks.
func ipv4Except(excluded []string) []string {
	type span struct{ a, b uint64 }
	var spans []span
	for _, c := range excluded {
		_, n, err := net.ParseCIDR(c)
		if err != nil || n.IP.To4() == nil {
			continue
		}
		ones, _ := n.Mask.Size()
		ip := n.IP.To4()
		start := uint64(ip[0])<<24 | uint64(ip[1])<<16 | uint64(ip[2])<<8 | uint64(ip[3])
		spans = append(spans, span{start, start + (1 << (32 - ones)) - 1})
	}
	var out []string
	var walk func(start uint64, bits int)
	walk = func(start uint64, bits int) {
		end := start + (1 << (32 - bits)) - 1
		overlap := false
		for _, s := range spans {
			if s.a <= start && end <= s.b {
				return
			}
			if s.a <= end && start <= s.b {
				overlap = true
			}
		}
		if !overlap {
			out = append(out, fmt.Sprintf("%d.%d.%d.%d/%d", start>>24, start>>16&255, start>>8&255, start&255, bits))
			return
		}
		walk(start, bits+1)
		walk(start+(1<<(32-bits-1)), bits+1)
	}
	walk(0, 0)
	return out
}

func startTunnel(plan *tunnelPlan) error {
	if err := stopTunnel(); err != nil {
		return err
	}
	if err := ensureDataDir(); err != nil {
		return fmt.Errorf("cannot prepare %s: %w", dataDir(), err)
	}
	confPath := filepath.Join(dataDir(), tunnelName+".conf")
	if err := os.WriteFile(confPath, []byte(plan.conf), 0o600); err != nil {
		return err
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("cannot talk to Windows services (run Raaz VPN as administrator): %w", err)
	}
	defer m.Disconnect()
	args := []string{"/service", confPath}
	if plan.tcpArg != "" {
		args = append(args, plan.tcpArg)
	}
	s, err := m.CreateService(serviceName, exe, mgr.Config{
		ServiceType:  windows.SERVICE_WIN32_OWN_PROCESS,
		StartType:    mgr.StartManual,
		ErrorControl: mgr.ErrorNormal,
		Dependencies: []string{"Nsi", "TcpIp"},
		DisplayName:  "Raaz VPN tunnel",
		Description:  "Keeps the Raaz VPN connection running.",
		SidType:      windows.SERVICE_SID_TYPE_UNRESTRICTED,
	}, args...)
	if err != nil {
		return fmt.Errorf("cannot create the VPN service: %w", err)
	}
	defer s.Close()
	if err := s.Start(); err != nil {
		_ = s.Delete()
		return fmt.Errorf("cannot start the VPN service: %w", err)
	}
	return nil
}

// Stops and removes the tunnel service, if there is one. Safe to call any time.
func stopTunnel() error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	s, err := m.OpenService(serviceName)
	if err != nil {
		return nil
	}
	_, _ = s.Control(svc.Stop)
	for i := 0; i < 100; i++ {
		st, err := s.Query()
		if err != nil || st.State == svc.Stopped {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	_ = s.Delete()
	s.Close()
	for i := 0; i < 50; i++ {
		s2, err := m.OpenService(serviceName)
		if err != nil {
			break
		}
		s2.Close()
		time.Sleep(100 * time.Millisecond)
	}
	_ = os.Remove(filepath.Join(dataDir(), tunnelName+".conf"))
	return nil
}

func tunnelRunning() bool {
	m, err := mgr.Connect()
	if err != nil {
		return false
	}
	defer m.Disconnect()
	s, err := m.OpenService(serviceName)
	if err != nil {
		return false
	}
	defer s.Close()
	st, err := s.Query()
	return err == nil && (st.State == svc.Running || st.State == svc.StartPending)
}

type tunnelStats struct {
	HandshakeAt time.Time
	RxBytes     uint64
	TxBytes     uint64
}

// Reads the peer's counters straight from the wireguard-nt adapter.
func readStats() (*tunnelStats, error) {
	a, err := driver.OpenAdapter(tunnelName)
	if err != nil {
		return nil, err
	}
	defer a.Close()
	cfg, err := a.Configuration()
	if err != nil {
		return nil, err
	}
	st := &tunnelStats{}
	if cfg.PeerCount == 0 {
		return st, nil
	}
	p := cfg.FirstPeer()
	st.RxBytes, st.TxBytes = p.RxBytes, p.TxBytes
	if p.LastHandshake > 0 {
		// 100-nanosecond intervals since 1 January 1601 (FILETIME).
		ft := windows.Filetime{LowDateTime: uint32(p.LastHandshake), HighDateTime: uint32(p.LastHandshake >> 32)}
		st.HandshakeAt = time.Unix(0, ft.Nanoseconds())
	}
	return st, nil
}

// --- service side ---

func runTunnelService(confPath string, extra []string) {
	logger := serviceLogger()
	for _, a := range extra {
		if strings.HasPrefix(a, "--tcp=") {
			parts := strings.Split(strings.TrimPrefix(a, "--tcp="), ",")
			if len(parts) == 4 {
				var port, local int
				fmt.Sscan(parts[1], &port)
				fmt.Sscan(parts[3], &local)
				f := &forwarder{host: parts[0], port: port, pin: parts[2], local: local, log: logger}
				go f.run()
			}
		}
	}
	tunnel.UseFixedGUIDInsteadOfDeterministic = true
	if err := tunnel.Run(confPath); err != nil {
		logger.Printf("tunnel stopped with error: %v", err)
		os.Exit(1)
	}
}

func serviceLogger() *log.Logger {
	path := filepath.Join(dataDir(), "service.log")
	if fi, err := os.Stat(path); err == nil && fi.Size() > 1<<20 {
		_ = os.Remove(path)
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return log.New(os.Stderr, "", log.LstdFlags)
	}
	return log.New(f, "", log.LstdFlags)
}
