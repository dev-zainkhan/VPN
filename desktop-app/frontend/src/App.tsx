import { useCallback, useEffect, useMemo, useState } from 'react';
import logo from './assets/logo.svg';
import { backend, errorText, type InitResult, type Protocol, type Region, type Settings, type Status } from './backend';

type View = 'home' | 'locations' | 'settings';

const idle: Status = {
  state: 'disconnected', detail: '', region: '', protocol: '', connectedSecs: 0, rxBytes: 0, txBytes: 0, balanceSeconds: 0, error: '',
};

function duration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function clock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function bytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// "Frankfurt, Germany" -> city Frankfurt, country Germany
function place(r: Region) {
  const [city = r.displayName, ...rest] = r.displayName.split(',');
  const country = rest.join(',').trim();
  return country ? { title: country, sub: city.trim() } : { title: city.trim(), sub: '' };
}

export function App() {
  const [init, setInit] = useState<InitResult | null>(null);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState<Status>(idle);
  const [settings, setSettings] = useState<Settings>({ protocol: 'auto', killSwitch: false, region: '' });
  const [pings, setPings] = useState<Record<string, number | null>>({});
  const [view, setView] = useState<View>('home');
  const [actionError, setActionError] = useState('');
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const r = await backend.init();
      setInit(r);
      setSettings(r.settings);
      setStatus((s) => ({ ...s, balanceSeconds: r.me.balanceSeconds }));
      const res = await backend.ping(r.regions);
      setPings(Object.fromEntries(res.map((p) => [p.code, p.ms >= 0 ? p.ms : null])));
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Connection state from Go, once a second.
  useEffect(() => {
    if (!init) return;
    const t = setInterval(() => {
      backend.status().then(setStatus).catch(() => undefined);
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(t);
  }, [init]);

  // Balance and daily refill time, every minute while not connected (Go keeps it fresh while connected).
  useEffect(() => {
    if (!init) return;
    const t = setInterval(async () => {
      try {
        const [cfg] = await Promise.all([backend.config(), backend.me()]);
        setInit((i) => (i ? { ...i, config: cfg } : i));
      } catch {
        /* offline: keep the last values */
      }
    }, 60000);
    return () => clearInterval(t);
  }, [init !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const fastest = useMemo(() => {
    if (!init) return null;
    const reachable = init.regions.filter((r) => pings[r.code] != null).sort((a, b) => pings[a.code]! - pings[b.code]!);
    return reachable[0] ?? init.regions[0] ?? null;
  }, [init, pings]);

  const chosen = init?.regions.find((r) => r.code === settings.region) ?? null;
  const target = chosen ?? fastest;

  const update = (s: Partial<Settings>) => {
    const next = { ...settings, ...s };
    setSettings(next);
    void backend.saveSettings(next);
  };

  const busy = status.state === 'connecting' || status.state === 'disconnecting';
  const connected = status.state === 'connected';
  const balance = status.balanceSeconds;
  const outOfTime = !connected && init !== null && balance <= 0;
  const refillIn = init ? Math.max(0, (Date.parse(init.config.nextDailyRefillAt) - now) / 1000) : 0;

  const toggle = async () => {
    if (busy || !target) return;
    setActionError('');
    try {
      if (connected) await backend.disconnect();
      else await backend.connect(target.code);
    } catch (e) {
      setActionError(errorText(e));
    }
    backend.status().then(setStatus).catch(() => undefined);
  };

  if (!init) {
    return (
      <div className="screen center">
        <img src={logo} className="logo-big" alt="" />
        {loadError ? (
          <>
            <h2>Can't reach Raaz</h2>
            <p className="muted">{loadError}</p>
            <button className="btn primary" onClick={() => void load()}>Try again</button>
          </>
        ) : (
          <p className="muted">Starting…</p>
        )}
      </div>
    );
  }

  if (view === 'locations') {
    const list = [...init.regions].sort((a, b) => place(a).title.localeCompare(place(b).title));
    return (
      <div className="screen">
        <Header title="Choose location" onBack={() => setView('home')} />
        <button className={`row card ${settings.region === '' ? 'selected' : ''}`} onClick={() => { update({ region: '' }); setView('home'); }}>
          <span className="chip bolt">⚡</span>
          <span className="grow"><b>Fastest location</b><small>{fastest ? `Now: ${place(fastest).title}` : 'Picks the best server for you'}</small></span>
          <Radio on={settings.region === ''} />
        </button>
        <p className="label">All locations</p>
        <div className="list">
          {list.map((r) => (
            <button key={r.code} className={`row card ${settings.region === r.code ? 'selected' : ''}`} onClick={() => { update({ region: r.code }); setView('home'); }}>
              <span className="chip">{r.countryCode.toUpperCase()}</span>
              <span className="grow"><b>{place(r).title}</b><small>{place(r).sub}</small></span>
              <Ping ms={pings[r.code]} />
              <Radio on={settings.region === r.code} />
            </button>
          ))}
        </div>
        {connected && <p className="muted small">A new location takes effect the next time you connect.</p>}
      </div>
    );
  }

  if (view === 'settings') {
    return (
      <div className="screen">
        <Header title="Settings" onBack={() => setView('home')} />
        <p className="label">Connection</p>
        <div className="card">
          <b>Protocol</b>
          <div className="segment">
            {(['auto', 'udp', 'tcp'] as Protocol[]).map((p) => (
              <button key={p} className={settings.protocol === p ? 'on' : ''} onClick={() => update({ protocol: p })}>
                {p === 'auto' ? 'Auto' : p.toUpperCase()}
              </button>
            ))}
          </div>
          <small>
            {settings.protocol === 'auto' && 'Recommended. Uses UDP for speed and switches to TCP automatically if your network blocks it.'}
            {settings.protocol === 'udp' && 'Fastest. Some mobile networks and offices block it.'}
            {settings.protocol === 'tcp' && 'Looks like normal web traffic (port 443). Works on networks that block VPNs.'}
          </small>
        </div>
        <div className="card row static">
          <span className="grow">
            <b>Kill switch</b>
            <small>Blocks all internet outside the VPN while connected, including your local network. Works in UDP mode.</small>
          </span>
          <button className={`switch ${settings.killSwitch ? 'on' : ''}`} aria-pressed={settings.killSwitch} onClick={() => update({ killSwitch: !settings.killSwitch })}>
            <span />
          </button>
        </div>
        {connected && <p className="muted small">Changes take effect the next time you connect.</p>}
        <p className="label">About</p>
        <div className="card links">
          <button onClick={() => void backend.openURL(`${init.legalSite}/privacy.html`)}>Privacy policy <span>›</span></button>
          <button onClick={() => void backend.openURL(`${init.legalSite}/terms.html`)}>Terms of use <span>›</span></button>
          {init.config.supportEmail && (
            <button onClick={() => void backend.openURL(`mailto:${init.config.supportEmail}`)}>Contact support <span>›</span></button>
          )}
        </div>
        <p className="muted small">
          Device ID: <span className="mono">{init.deviceId}</span>
          <br />
          Raaz VPN for Windows {init.version}
        </p>
      </div>
    );
  }

  const regionName = (code: string) => {
    const r = init.regions.find((x) => x.code === code);
    return r ? place(r).title : code;
  };

  return (
    <div className="screen">
      <div className="top">
        <div className="brand"><img src={logo} alt="" /><span>Raaz</span></div>
        <button className="icon-btn" title="Settings" onClick={() => setView('settings')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
          </svg>
        </button>
      </div>

      <div className="card time">
        <div>
          <p className="label">Time left</p>
          <p className="big">{duration(balance)}</p>
        </div>
        <div className="refill">
          <span className="sun">☼</span>
          <span><b>Free daily</b><small>Refills in {duration(refillIn)}</small></span>
        </div>
      </div>

      <div className="power-wrap">
        <button className={`power ${status.state}`} disabled={busy || outOfTime || !target} onClick={() => void toggle()} aria-label={connected ? 'Disconnect' : 'Connect'}>
          <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 3v8" />
            <path d="M6.3 6.8a8 8 0 1 0 11.4 0" />
          </svg>
        </button>
      </div>

      <div className="state">
        {status.state === 'connected' && (
          <>
            <h1 className="ok">Protected</h1>
            <p className="muted">{regionName(status.region)} · {status.protocol.toUpperCase()} · {clock(status.connectedSecs)}</p>
            <p className="muted small">↓ {bytes(status.rxBytes)} &nbsp; ↑ {bytes(status.txBytes)}</p>
          </>
        )}
        {status.state === 'connecting' && (<><h1>Connecting…</h1><p className="muted">{status.detail || 'Setting up a secure tunnel'}</p></>)}
        {status.state === 'disconnecting' && (<><h1>Disconnecting…</h1><p className="muted">&nbsp;</p></>)}
        {status.state === 'disconnected' && (
          outOfTime ? (
            <><h1>Out of free time</h1><p className="muted">Today's free time is used up. It refills in {duration(refillIn)}.</p></>
          ) : (
            <><h1>Not protected</h1><p className="muted">Click to connect · your IP is visible</p></>
          )
        )}
        {(actionError || status.error) && status.state === 'disconnected' && <p className="error">{actionError || status.error}</p>}
      </div>

      <button className="row card location" onClick={() => setView('locations')}>
        <span className={`chip ${chosen ? '' : 'bolt'}`}>{chosen ? chosen.countryCode.toUpperCase() : '⚡'}</span>
        <span className="grow">
          <b>{chosen ? place(chosen).title : 'Fastest location'}</b>
          <small>{chosen ? place(chosen).sub || 'Selected' : fastest ? place(fastest).title : 'Picks the best server for you'}</small>
        </span>
        <span className="chev">›</span>
      </button>
      <p className="muted small center-text">🔒 Protocol: {settings.protocol === 'auto' ? 'Auto' : settings.protocol.toUpperCase()}</p>
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="top">
      <button className="icon-btn" onClick={onBack} aria-label="Back">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
      </button>
      <h2>{title}</h2>
      <span className="icon-btn ghost" />
    </div>
  );
}

function Radio({ on }: { on: boolean }) {
  return <span className={`radio ${on ? 'on' : ''}`} />;
}

function Ping({ ms }: { ms: number | null | undefined }) {
  if (ms === undefined) return <span className="ping">…</span>;
  if (ms === null) return <span className="ping bad">—</span>;
  return <span className={`ping ${ms < 120 ? 'good' : 'mid'}`}>{ms} ms</span>;
}
