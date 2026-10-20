package main

import (
	"context"
	"errors"
	"net"
	"strconv"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App holds the connection state; its exported methods are called by the window (Wails bindings).
type App struct {
	ctx    context.Context
	mu     sync.Mutex
	state  *State
	client *apiClient
	cfg    *AppConfig

	status      string // disconnected | connecting | connected | disconnecting
	detail      string // e.g. "Trying TCP…"
	region      string
	protocol    string
	connectedAt time.Time
	lastError   string
	balance     int64
	busy        bool
}

func newApp() *App {
	return &App{state: loadState(), client: newAPIClient(apiBase), status: "disconnected"}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// A tunnel left behind by a crash or a forced shutdown: remove it so the state is clear.
	if tunnelRunning() {
		_ = stopTunnel()
	}
	go a.monitor()
}

func (a *App) beforeClose(ctx context.Context) bool {
	a.mu.Lock()
	connected := a.status == "connected" || a.status == "connecting"
	a.mu.Unlock()
	if connected {
		_ = a.Disconnect()
	}
	return false
}

func (a *App) onSecondInstance(_ options.SecondInstanceData) {
	runtime.WindowUnminimise(a.ctx)
	runtime.WindowShow(a.ctx)
}

// --- what the window sees ---

type Settings struct {
	Protocol   string `json:"protocol"`
	KillSwitch bool   `json:"killSwitch"`
	Region     string `json:"region"`
}

type InitResult struct {
	DeviceID   string     `json:"deviceId"`
	Version    string     `json:"version"`
	APIBase    string     `json:"apiBase"`
	Me         *Me        `json:"me"`
	Config     *AppConfig `json:"config"`
	Regions    []Region   `json:"regions"`
	Settings   Settings   `json:"settings"`
	LegalSite  string     `json:"legalSite"`
}

type Status struct {
	State          string `json:"state"`
	Detail         string `json:"detail"`
	Region         string `json:"region"`
	Protocol       string `json:"protocol"`
	ConnectedSecs  int64  `json:"connectedSecs"`
	RxBytes        uint64 `json:"rxBytes"`
	TxBytes        uint64 `json:"txBytes"`
	BalanceSeconds int64  `json:"balanceSeconds"`
	Error          string `json:"error"`
}

// Init loads the saved device, or registers this computer on first start.
func (a *App) Init() (*InitResult, error) {
	if err := a.ensureIdentity(); err != nil {
		return nil, err
	}
	me, err := a.client.me()
	if isAuthError(err) {
		// The server no longer knows this device (for example a reset database): start over.
		a.state.DeviceID, a.state.Token = "", ""
		_ = a.state.save()
		if err = a.ensureIdentity(); err != nil {
			return nil, err
		}
		me, err = a.client.me()
	}
	if err != nil {
		return nil, err
	}
	cfg, err := a.client.config()
	if err != nil {
		return nil, err
	}
	regions, err := a.client.regions()
	if err != nil {
		return nil, err
	}
	a.mu.Lock()
	a.cfg, a.balance = cfg, me.BalanceSeconds
	a.mu.Unlock()
	if me.Session != nil && !tunnelRunning() {
		_ = a.client.disconnect() // a session from an earlier run that never ended cleanly
		me.Session = nil
	}
	return &InitResult{
		DeviceID:  a.state.DeviceID,
		Version:   version,
		APIBase:   apiBase,
		Me:        me,
		Config:    cfg,
		Regions:   regions,
		Settings:  Settings{Protocol: a.state.Protocol, KillSwitch: a.state.KillSwitch, Region: a.state.Region},
		LegalSite: "https://dev-zainkhan.github.io/VPN",
	}, nil
}

func (a *App) ensureIdentity() error {
	if a.state.PrivateKey == "" || a.state.secret(a.state.PrivateKey) == "" {
		k, err := generatePrivateKey()
		if err != nil {
			return err
		}
		a.state.PrivateKey = sealSecret(k)
		if a.state.PrivateKey == "" {
			return errors.New("cannot protect the VPN key on this computer")
		}
	}
	if tok := a.state.secret(a.state.Token); a.state.DeviceID != "" && tok != "" {
		a.client.token = tok
		return a.state.save()
	}
	a.client.token = ""
	reg, err := a.client.register(abuseKey())
	if err != nil {
		return err
	}
	a.state.DeviceID = reg.DeviceID
	a.state.Token = sealSecret(reg.DeviceToken)
	a.client.token = reg.DeviceToken
	return a.state.save()
}

func (a *App) Me() (*Me, error) {
	me, err := a.client.me()
	if err == nil {
		a.mu.Lock()
		a.balance = me.BalanceSeconds
		a.mu.Unlock()
	}
	return me, err
}

func (a *App) Config() (*AppConfig, error) {
	cfg, err := a.client.config()
	if err == nil {
		a.mu.Lock()
		a.cfg = cfg
		a.mu.Unlock()
	}
	return cfg, err
}

type PingResult struct {
	Code string `json:"code"`
	Ms   int    `json:"ms"` // -1 when unreachable
}

// Ping measures a TCP connect to each region's ping host, like the Android app.
func (a *App) Ping(regions []Region) []PingResult {
	out := make([]PingResult, len(regions))
	var wg sync.WaitGroup
	for i, r := range regions {
		wg.Add(1)
		go func(i int, r Region) {
			defer wg.Done()
			best := -1
			for try := 0; try < 2; try++ {
				t := time.Now()
				c, err := net.DialTimeout("tcp", net.JoinHostPort(r.PingHost, strconv.Itoa(r.PingPort)), 3*time.Second)
				if err != nil {
					continue
				}
				c.Close()
				ms := int(time.Since(t).Milliseconds())
				if best < 0 || ms < best {
					best = ms
				}
			}
			out[i] = PingResult{Code: r.Code, Ms: best}
		}(i, r)
	}
	wg.Wait()
	return out
}

func (a *App) SaveSettings(s Settings) error {
	if s.Protocol != "udp" && s.Protocol != "tcp" {
		s.Protocol = "auto"
	}
	a.state.Protocol, a.state.KillSwitch, a.state.Region = s.Protocol, s.KillSwitch, s.Region
	return a.state.save()
}

func (a *App) Status() Status {
	a.mu.Lock()
	defer a.mu.Unlock()
	st := Status{State: a.status, Detail: a.detail, Region: a.region, Protocol: a.protocol, Error: a.lastError, BalanceSeconds: a.balance}
	if a.status == "connected" {
		st.ConnectedSecs = int64(time.Since(a.connectedAt).Seconds())
		if s, err := readStats(); err == nil {
			st.RxBytes, st.TxBytes = s.RxBytes, s.TxBytes
		}
	}
	return st
}

func (a *App) OpenURL(url string) {
	runtime.BrowserOpenURL(a.ctx, url)
}

// Connect opens the tunnel to a region. Auto mode tries UDP first and falls back to TCP after
// 8 seconds without a handshake (spec 8.6), starting with whichever worked last time.
func (a *App) Connect(region string) error {
	a.mu.Lock()
	if a.busy {
		a.mu.Unlock()
		return errors.New("Please wait, still busy")
	}
	a.busy = true
	a.status, a.detail, a.region, a.lastError = "connecting", "", region, ""
	a.mu.Unlock()
	defer func() {
		a.mu.Lock()
		a.busy = false
		a.mu.Unlock()
	}()

	err := a.connect(region)
	a.mu.Lock()
	if err != nil {
		a.status, a.detail, a.lastError = "disconnected", "", err.Error()
	} else {
		a.status, a.detail, a.connectedAt = "connected", "", time.Now()
	}
	a.mu.Unlock()
	return err
}

func (a *App) connect(region string) error {
	_ = stopTunnel()
	priv := a.state.secret(a.state.PrivateKey)
	pub, err := publicKeyFor(priv)
	if err != nil {
		return err
	}
	var order []string
	switch a.state.Protocol {
	case "udp":
		order = []string{"udp"}
	case "tcp":
		order = []string{"tcp"}
	default:
		order = []string{"udp", "tcp"}
		if a.state.LastGood == "tcp" {
			order = []string{"tcp", "udp"}
		}
	}
	localPort := 51821
	if a.cfg != nil && a.cfg.TCPLocalPort > 0 {
		localPort = a.cfg.TCPLocalPort
	}

	var lastErr error
	for i, proto := range order {
		a.setDetail(map[string]string{"udp": "Connecting…", "tcp": "Trying TCP mode…"}[proto])
		resp, err := a.client.connect(region, proto, pub)
		if err != nil {
			return err // no minutes, blocked, region unavailable: trying another protocol won't help
		}
		a.mu.Lock()
		a.protocol, a.balance = proto, resp.BalanceSeconds
		a.mu.Unlock()
		plan, err := buildTunnel(resp, priv, proto, a.state.KillSwitch, localPort)
		if err == nil {
			err = startTunnel(plan)
		}
		if err != nil {
			_ = a.client.disconnect()
			return err
		}
		wait := 15 * time.Second
		if len(order) > 1 && i == 0 {
			wait = 8 * time.Second
		}
		if waitForHandshake(wait) {
			if a.state.Protocol == "auto" {
				a.state.LastGood = proto
				_ = a.state.save()
			}
			return nil
		}
		_ = stopTunnel()
		_ = a.client.disconnect()
		lastErr = errors.New("Could not connect. Your network may be blocking VPNs; try another location.")
		if proto == "udp" && len(order) == 1 {
			lastErr = errors.New("No reply over UDP. Your network may block it; choose Auto or TCP in Settings.")
		}
	}
	return lastErr
}

func waitForHandshake(timeout time.Duration) bool {
	until := time.Now().Add(timeout)
	for time.Now().Before(until) {
		if s, err := readStats(); err == nil && !s.HandshakeAt.IsZero() {
			return true
		}
		if !tunnelRunning() && time.Until(until) < timeout-2*time.Second {
			return false
		}
		time.Sleep(400 * time.Millisecond)
	}
	return false
}

func (a *App) setDetail(d string) {
	a.mu.Lock()
	a.detail = d
	a.mu.Unlock()
}

func (a *App) Disconnect() error {
	a.mu.Lock()
	a.status, a.detail = "disconnecting", ""
	a.mu.Unlock()
	err := stopTunnel()
	_ = a.client.disconnect()
	a.mu.Lock()
	a.status, a.protocol = "disconnected", ""
	a.mu.Unlock()
	return err
}

// monitor notices when the server ends the session (minutes used up) or the service stops.
func (a *App) monitor() {
	tick := time.NewTicker(20 * time.Second)
	defer tick.Stop()
	for range tick.C {
		a.mu.Lock()
		connected := a.status == "connected" && !a.busy
		a.mu.Unlock()
		if !connected {
			continue
		}
		reason := ""
		if !tunnelRunning() {
			reason = "The VPN stopped unexpectedly. Please connect again."
		} else if me, err := a.client.me(); err == nil {
			a.mu.Lock()
			a.balance = me.BalanceSeconds
			a.mu.Unlock()
			if me.Session == nil {
				reason = "Your free time is used up for today."
				if me.BalanceSeconds > 60 {
					reason = "The server ended the connection. Please connect again."
				}
			}
		}
		if reason != "" {
			_ = stopTunnel()
			a.mu.Lock()
			a.status, a.protocol, a.lastError = "disconnected", "", reason
			a.mu.Unlock()
			runtime.EventsEmit(a.ctx, "status")
		}
	}
}
