import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Cloud,
  Copy,
  Eye,
  EyeOff,
  Filter,
  Globe2,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Server as ServerIcon,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Smartphone,
  X,
  RefreshCw,
  Play,
  Clock3,
  ShieldCheck,
} from 'lucide-react';
import {
  api,
  ApiError,
  creditsText,
  errorText,
  setSessionLostHandler,
  UUID_RE,
  type Account,
  type AdminMe,
  type Dashboard,
  type DeviceDetail,
  type DeviceList,
  type FreeTierPlan,
  type KeyTest,
  type Region,
  type RewardsSummary,
  type Server,
  type ServerList,
  type ServerStatus,
  type Settings,
} from './api';
import {
  chartLabel,
  cityOf,
  formatAgo,
  formatBalance,
  formatDate,
  formatNumber,
  formatUptime,
  percent,
  shortDevice,
  shortId,
  type Page,
} from './format';

type Notice = { tone: 'success' | 'error' | 'warning'; text: string } | null;
type Confirm = { title: string; text: string; action: string; onConfirm: () => Promise<void>; danger?: boolean };
type AccountDrawerMode = { kind: 'add' } | { kind: 'keys'; account: Account } | { kind: 'edit'; account: Account };
type DrawerState =
  | { kind: 'account'; mode: AccountDrawerMode }
  | { kind: 'server' }
  | { kind: 'install'; command: string; providerName: string; regionName: string }
  | { kind: 'device'; id: string }
  | null;

const PLAN_LABELS: Record<FreeTierPlan, string> = {
  legacy_12_month: '12-month free tier',
  free_plan_credits: 'Free plan (credits)',
  paid: 'Paid',
};

const navGroups: { label?: string; items: { page: Page; icon: typeof LayoutDashboard }[] }[] = [
  { items: [{ page: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Infrastructure',
    items: [
      { page: 'AWS accounts', icon: Cloud },
      { page: 'Servers', icon: ServerIcon },
      { page: 'Regions', icon: Globe2 },
    ],
  },
  { label: 'Users', items: [{ page: 'Devices', icon: Smartphone }] },
  { items: [{ page: 'Rewards', icon: Play }] },
  { label: 'System', items: [{ page: 'Settings', icon: SlidersHorizontal }] },
];

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

// Loads data for a page; `reload` refetches. Errors are shown in the page, not thrown.
function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const result = await load();
      if (mine === seq.current) {
        setData(result);
        setError('');
      }
    } catch (e) {
      if (mine === seq.current) setError(errorText(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, deps);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, setData, error, loading, reload };
}

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand-mark${small ? ' brand-mark-small' : ''}`}>
      <ShieldCheck size={small ? 18 : 21} strokeWidth={2.4} />
    </div>
  );
}

function App() {
  const [me, setMe] = useState<AdminMe | null | 'checking'>('checking');

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    setSessionLostHandler(() => setMe(null));
    void refreshMe();
  }, [refreshMe]);

  if (me === 'checking') return <div className="login-page"><div className="login-card-wrap"><p className="muted-text">Loading…</p></div></div>;
  if (me === null) return <LoginScreen onSignedIn={refreshMe} />;
  return <Console me={me} refreshMe={refreshMe} onSignedOut={() => setMe(null)} />;
}

function Console({ me, refreshMe, onSignedOut }: { me: AdminMe; refreshMe: () => Promise<void>; onSignedOut: () => void }) {
  const [page, setPage] = useState<Page>('Dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [serverSearch, setServerSearch] = useState('');
  const [serverStatus, setServerStatus] = useState<'all' | ServerStatus>('all');
  const [deviceQuery, setDeviceQuery] = useState('');
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [modal, setModal] = useState<Confirm | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // The dashboard also feeds the sidebar badges and the "updated" time.
  const dash = useLoad(() => api.dashboard(), [refreshKey]);
  const [updatedAt, setUpdatedAt] = useState(new Date());
  useEffect(() => {
    if (dash.data) setUpdatedAt(new Date());
  }, [dash.data]);
  useEffect(() => {
    const t = window.setInterval(() => void dash.reload(), 60_000);
    return () => window.clearInterval(t);
  }, [dash.reload]);

  const alerts = (dash.data?.alerts ?? []).filter((a) => !dismissedAlerts.includes(a.id));
  const failedServers = (dash.data?.alerts ?? []).filter((a) => a.targetType === 'server').length;
  const badges: Partial<Record<Page, number>> = { Dashboard: alerts.length, Servers: failedServers };

  const showToast = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast(null), 3200);
  }, []);
  const showError = useCallback((e: unknown) => showToast(errorText(e), true), [showToast]);

  const openDrawer = (next: DrawerState) => {
    setDrawer(next);
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    window.setTimeout(() => setDrawer(null), 220);
  };

  const navigate = (next: Page) => {
    setPage(next);
    setSidebarOpen(false);
    setMobileMenuOpen(false);
    setGlobalSearch('');
    setMobileSearchOpen(false);
  };

  const submitGlobalSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = globalSearch.trim();
    if (!query) return;
    // Devices can only be found by their full ID; anything else searches the server list.
    if (UUID_RE.test(query)) {
      setDeviceQuery(query);
      navigate('Devices');
    } else {
      setServerSearch(query);
      setServerStatus('all');
      navigate('Servers');
    }
  };

  const confirm = (c: Confirm) => setModal(c);
  const runModal = async () => {
    if (!modal) return;
    setModalBusy(true);
    try {
      await modal.onConfirm();
      setModal(null);
    } catch (e) {
      showError(e);
    } finally {
      setModalBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      // The session is gone either way.
    }
    onSignedOut();
  };

  const refreshAll = () => {
    setRefreshKey((k) => k + 1);
    showToast('Refreshed');
  };

  return (
    <div className="admin-shell">
      <div className={`mobile-overlay${sidebarOpen ? ' visible' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <BrandMark />
          <div><strong>Veil</strong><span>Admin console</span></div>
          <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>
        <nav className="side-nav" aria-label="Admin navigation">
          {navGroups.map((group, index) => (
            <div className="nav-group" key={group.label ?? `group-${index}`}>
              {group.label && <div className="nav-section-label">{group.label}</div>}
              {group.items.map(({ page: itemPage, icon: Icon }) => {
                const badge = badges[itemPage];
                return (
                  <button className={`nav-item${page === itemPage ? ' active' : ''}`} key={itemPage} onClick={() => navigate(itemPage)}>
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{itemPage}</span>
                    {badge ? <span className={`nav-badge${itemPage === 'Dashboard' ? ' alert-badge' : ''}`}>{badge}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{me.email.charAt(0).toUpperCase()}</div>
          <div className="admin-identity"><strong>Admin</strong><span>{me.email}</span></div>
          <button className="icon-button signout" title="Sign out" onClick={() => void signOut()}><LogOut size={17} /></button>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Admin</span><ChevronRight size={15} /><strong>{page}</strong></div>
          <button className="icon-button mobile-search-toggle" aria-label="Search" onClick={() => setMobileSearchOpen((c) => !c)}><Search size={17} /></button>
          <form className={`global-search${mobileSearchOpen ? ' global-search-open' : ''}`} onSubmit={submitGlobalSearch}>
            <Search size={17} />
            <input
              aria-label="Search by full device ID, server or IP"
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              placeholder="Full device ID, server or IP"
            />
            <kbd>↵</kbd>
          </form>
          <div className="environment"><span />{isLocal ? 'Local' : 'Production'}</div>
          <span className="updated-time">Updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <button className="icon-button refresh-button" title="Refresh" onClick={refreshAll}><RefreshCw size={17} /></button>
          <button className="icon-button notification-button" title="Alerts" onClick={() => navigate('Dashboard')}><Bell size={17} />{alerts.length > 0 && <i />}</button>
          <button className="mobile-avatar" onClick={() => setMobileMenuOpen((c) => !c)}>{me.email.charAt(0).toUpperCase()}</button>
        </header>

        {mobileMenuOpen && (
          <div className="mobile-profile">
            <span>Signed in as <strong>{me.email}</strong></span>
            <button onClick={() => void signOut()}><LogOut size={15} /> Sign out</button>
          </div>
        )}

        <div className="page-scroll">
          <div className="page-content" key={refreshKey}>
            {page === 'Dashboard' && (
              <DashboardPage
                data={dash.data}
                error={dash.error}
                alerts={alerts}
                dismissAlert={(id) => setDismissedAlerts((c) => [...c, id])}
                onNavigate={navigate}
                onOpenFailedServers={() => {
                  setServerStatus('failed');
                  setServerSearch('');
                  navigate('Servers');
                }}
              />
            )}
            {page === 'AWS accounts' && (
              <AccountsPage
                onOpen={(mode) => openDrawer({ kind: 'account', mode })}
                confirm={confirm}
                showToast={showToast}
                showError={showError}
                refreshKey={drawer === null ? 0 : 1}
              />
            )}
            {page === 'Servers' && (
              <ServersPage
                onShowInstall={(command, providerName, regionName) => openDrawer({ kind: 'install', command, providerName, regionName })}
                status={serverStatus}
                onStatusChange={setServerStatus}
                search={serverSearch}
                onSearch={setServerSearch}
                onCreate={() => openDrawer({ kind: 'server' })}
                confirm={confirm}
                showToast={showToast}
                showError={showError}
                refreshKey={drawer === null ? 0 : 1}
              />
            )}
            {page === 'Regions' && <RegionsPage showToast={showToast} showError={showError} />}
            {page === 'Devices' && (
              <DevicesPage
                query={deviceQuery}
                onQuery={setDeviceQuery}
                onOpenDevice={(id) => openDrawer({ kind: 'device', id })}
                refreshKey={drawer === null ? 0 : 1}
              />
            )}
            {page === 'Rewards' && <RewardsPage onReview={(id) => openDrawer({ kind: 'device', id })} />}
            {page === 'Settings' && <SettingsPage me={me} refreshMe={refreshMe} showToast={showToast} />}
          </div>
          <footer className="page-footer"><span>Veil Admin</span><span>Connected to the Veil API</span><span>Build v0.2.0</span></footer>
        </div>
      </main>

      {drawer && (
        <div className="drawer-layer">
          <button className="drawer-scrim" aria-label="Close panel" onClick={closeDrawer} />
          <aside className={`drawer${drawerOpen ? ' drawer-open' : ''}`}>
            {drawer.kind === 'account' && (
              <AccountDrawer mode={drawer.mode} onClose={closeDrawer} onSaved={(text) => { showToast(text); dash.reload(); closeDrawer(); }} />
            )}
            {drawer.kind === 'server' && (
              <ServerDrawer
                onClose={closeDrawer}
                onCreated={(text) => { showToast(text); dash.reload(); closeDrawer(); }}
                onManualCreated={(command, providerName, regionName) => { dash.reload(); openDrawer({ kind: 'install', command, providerName, regionName }); }}
              />
            )}
            {drawer.kind === 'install' && (
              <InstallDrawer command={drawer.command} providerName={drawer.providerName} regionName={drawer.regionName} onClose={closeDrawer} showToast={showToast} />
            )}
            {drawer.kind === 'device' && (
              <DeviceDrawer id={drawer.id} onClose={closeDrawer} confirm={confirm} showToast={showToast} showError={showError} />
            )}
          </aside>
        </div>
      )}

      {modal && (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className={`confirm-icon${modal.danger ? ' danger' : ''}`}>{modal.danger ? <AlertTriangle size={21} /> : <CircleHelp size={21} />}</div>
            <h2 id="confirm-title">{modal.title}</h2>
            <p>{modal.text}</p>
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => setModal(null)} disabled={modalBusy}>Cancel</button>
              <button className={`button${modal.danger ? ' button-danger' : ' button-primary'}`} onClick={() => void runModal()} disabled={modalBusy}>
                {modalBusy ? 'Working…' : modal.action}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" style={toast.error ? { borderColor: '#f3d5d2', color: '#a3413b', background: '#fff6f5' } : undefined}>
          {toast.error ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}{toast.text}
        </div>
      )}
    </div>
  );
}

function LoginScreen({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needCode, setNeedCode] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    const totp = String(data.get('totp') ?? '').trim();
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (totp && !/^\d{6}$/.test(totp)) {
      setError('The authenticator code has 6 digits.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.login(email, password, totp || undefined);
      await onSignedIn();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TOTP_REQUIRED') {
        setNeedCode(true);
        window.setTimeout(() => codeRef.current?.focus(), 0);
      }
      if (e instanceof ApiError && e.code === 'ACCOUNT_LOCKED') {
        const until = (e.details as { lockedUntil?: string } | undefined)?.lockedUntil;
        setError(until ? `Too many failed attempts. Try again after ${new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : errorText(e));
      } else {
        setError(errorText(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-glow login-glow-one" /><div className="login-glow login-glow-two" />
      <div className="login-card-wrap">
        <div className="login-brand"><BrandMark /><span>Veil<span className="brand-period">.</span></span></div>
        <div className="login-heading">
          <div className="eyebrow"><LockKeyhole size={13} /> SECURE ADMIN ACCESS</div>
          <h1>Good to see you.</h1>
          <p>Sign in to your Veil Admin console.</p>
        </div>
        <form className="login-form" onSubmit={(e) => void submit(e)}>
          <label>Email address<input name="email" type="email" autoComplete="username" placeholder="you@company.com" /></label>
          <label>
            <span className="label-row">Password</span>
            <span className="password-input"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((c) => !c)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
          </label>
          <label>Authentication code {!needCode && <span className="optional">IF 2FA IS ON</span>}<input ref={codeRef} name="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" /></label>
          {error && <div className="inline-alert inline-alert-error"><AlertTriangle size={16} />{error}</div>}
          <button className="button button-primary login-submit" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} /></button>
          <p className="login-lockout"><Shield size={14} /> After 5 failed attempts, sign-in is locked for 15 minutes.</p>
        </form>
        <div className="login-footer">Protected by <strong>Veil security</strong><span>•</span> {isLocal ? 'Local' : 'Production'}</div>
      </div>
      <div className="login-side">
        <span className="side-kicker"><span /> CONTROL PLANE</span>
        <h2>Everything running.<br /><span>Nothing overlooked.</span></h2>
        <p>One clear view of your VPN fleet, devices and rewards—with privacy built into every layer.</p>
        <div className="login-stats">
          <div><span className="stat-icon"><ServerIcon size={17} /></span><strong>UDP</strong><span>+ TCP 443 fallback</span></div>
          <div><span className="stat-icon"><Globe2 size={17} /></span><strong>17</strong><span>AWS regions</span></div>
          <div><span className="stat-icon"><ShieldCheck size={17} /></span><strong>100%</strong><span>privacy first</span></div>
        </div>
        <div className="privacy-note"><LockKeyhole size={15} /><span>No browsing activity is collected or shown here.</span></div>
      </div>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>
      {action}
    </div>
  );
}

function Button({ children, variant = 'secondary', icon, onClick, type = 'button', disabled = false }: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
  icon?: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return <button className={`button button-${variant}`} type={type} onClick={onClick} disabled={disabled}>{icon}{children}</button>;
}

function MetricCard({ label, value, note, icon: Icon, accent = false }: {
  label: string; value: string; note: string; icon: typeof Activity; accent?: boolean;
}) {
  return (
    <div className={`metric-card${accent ? ' metric-accent' : ''}`}>
      <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17} /></span></div>
      <strong className="metric-value">{value}</strong>
      <div className="metric-note">{note}</div>
      <div className="metric-sparkline"><i /><i /><i /><i /><i /><i /><i /><i /></div>
    </div>
  );
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone: 'green' | 'red' | 'amber' | 'blue' | 'gray' }) {
  return <span className={`status-pill tone-${tone}`}><i />{children}</span>;
}

function ProgressBar({ value, max, warnAt = 80 }: { value: number; max: number; warnAt?: number }) {
  const current = percent(value, max);
  return <div className="progress-track"><span className={current >= warnAt ? 'progress-warn' : ''} style={{ width: `${current}%` }} /><i style={{ left: `${warnAt}%` }} /></div>;
}

function LoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <div className="inline-alert inline-alert-error"><AlertTriangle size={16} /><span>{error} <button className="text-button" onClick={onRetry}>Try again</button></span></div>;
}

function Loading() {
  return <p className="muted-text" style={{ padding: 18 }}>Loading…</p>;
}

// One usage cell: a bar when there is a limit, plain text when the plan has none.
function UsageMeter({ value, max, unit, credits }: { value: number; max: number | null; unit: string; credits?: boolean }) {
  if (max === null) {
    return (
      <div className="usage-meter">
        <div className="usage-value" style={{ justifyContent: 'flex-start' }}><span>{value} {unit} · {credits ? 'paid from credits' : 'no free limit'}</span></div>
      </div>
    );
  }
  const p = percent(value, max);
  return (
    <div className="usage-meter">
      <div className={`usage-value${p >= 80 ? ' usage-warning' : ''}`}><span>{value} / {max} {unit}</span><span>{p}%</span></div>
      <ProgressBar value={value} max={max} />
    </div>
  );
}

function DashboardPage({ data, error, alerts, dismissAlert, onNavigate, onOpenFailedServers }: {
  data: Dashboard | null; error: string; alerts: Dashboard['alerts'];
  dismissAlert: (id: string) => void; onNavigate: (page: Page) => void; onOpenFailedServers: () => void;
}) {
  const maxOnline = Math.max(1, ...(data?.regions ?? []).map((r) => r.online));
  return (
    <>
      <PageHeading eyebrow="OVERVIEW" title="Dashboard" description="Live overview of your VPN fleet. Numbers refresh every 60 seconds." />
      {error && <div className="inline-alert inline-alert-error"><AlertTriangle size={16} />{error}</div>}
      {!data && !error && <Loading />}
      {data && (
        <>
          {alerts.length > 0 && (
            <section className="attention-card card">
              <div className="attention-heading"><div><h2>Needs attention</h2><span className="count-badge">{alerts.length}</span></div><span className="muted-text">Resolve issues to keep your fleet healthy</span></div>
              {alerts.map((a) => {
                const Icon = a.targetType === 'server' ? ServerIcon : a.id.startsWith('account-keys') ? KeyRound : Activity;
                const [cta, action] = a.targetType === 'server' ? ['View server', onOpenFailedServers] : ['View account', () => onNavigate('AWS accounts')];
                return (
                  <div className="alert-row" key={a.id}>
                    <span className={`alert-icon ${a.severity}`}><Icon size={18} /></span>
                    <div className="alert-copy"><strong>{a.title}</strong><span>{a.text}</span></div>
                    <button className="button button-secondary alert-cta" onClick={action}>{cta}</button>
                    <button className="icon-button alert-dismiss" aria-label={`Dismiss ${a.title}`} onClick={() => dismissAlert(a.id)}><X size={16} /></button>
                  </div>
                );
              })}
            </section>
          )}

          <div className="metric-grid">
            <MetricCard label="Active servers" value={formatNumber(data.kpis.activeServers)} note={`Across ${data.kpis.activeRegions} region${data.kpis.activeRegions === 1 ? '' : 's'}`} icon={ServerIcon} />
            <MetricCard label="Online now" value={formatNumber(data.kpis.onlineNow)} note="Handshake in the last 3 minutes" icon={Activity} />
            <MetricCard label="New devices today" value={formatNumber(data.kpis.newDevicesToday)} note="Since 00:00 UTC" icon={Smartphone} />
            <MetricCard label="Ads watched today" value={formatNumber(data.kpis.adsToday)} note="Verified by AdMob" icon={Play} />
            <MetricCard label="Minutes granted" value={formatNumber(data.kpis.minutesGrantedToday)} note="From verified ads today" icon={Clock3} accent />
          </div>

          <div className="dashboard-grid">
            <section className="card usage-card">
              <div className="card-header">
                <div><h2>Free-tier usage this month</h2><p>Warning at 80% of each limit</p></div>
                <button className="inline-link" onClick={() => onNavigate('AWS accounts')}>View accounts <ArrowRight size={15} /></button>
              </div>
              <div className="usage-columns"><span>Account</span><span>Compute hours</span><span>Data out</span></div>
              {data.usage.length === 0 && <p className="muted-text">No AWS accounts yet.</p>}
              {data.usage.map((u) => (
                <div className="usage-row" key={u.accountId}>
                  <div><strong>{u.nickname}</strong><CreditsLine credits={u.credits} /></div>
                  <UsageMeter value={u.computeHours} max={u.computeLimitHours} unit="h" credits />
                  <UsageMeter value={u.dataOutGb} max={u.dataOutLimitGb} unit="GB" />
                </div>
              ))}
              <div className="usage-footnote"><span><i className="legend-green" />Within free-tier limits</span><span><i className="legend-amber" />80%+ warning</span></div>
            </section>

            <section className="card regions-card">
              <div className="card-header"><div><h2>Servers by region</h2><p>Servers that are not terminated</p></div><button className="inline-link" onClick={() => onNavigate('Servers')}>View servers <ArrowRight size={15} /></button></div>
              <div className="region-chart">
                {data.regions.length === 0 && <p className="muted-text">No servers yet. Create one on the Servers page.</p>}
                {data.regions.map((r) => (
                  <button className="region-bar-row" key={r.code} onClick={() => onNavigate('Servers')}>
                    <span className="region-flag">{r.code.split('-')[0]!.toUpperCase()}</span><span className="region-name">{cityOf(r.displayName)}</span>
                    <span className="region-bar"><i style={{ width: `${Math.max((r.online / maxOnline) * 92, 4)}%` }} /></span>
                    <span className="region-total">{r.servers}</span><span className="region-online">{r.online} <small>online</small></span>
                  </button>
                ))}
              </div>
              <div className="regions-total"><Globe2 size={15} />{data.regions.length} region{data.regions.length === 1 ? '' : 's'} with servers</div>
            </section>
          </div>
          <section className="fleet-strip">
            <span className="fleet-strip-icon"><ShieldCheck size={18} /></span>
            <div><strong>Privacy-first infrastructure</strong><span>Connection activity is never logged. Only live device and fleet status is shown.</span></div>
            <button className="inline-link" onClick={() => onNavigate('Devices')}>View devices <ArrowRight size={15} /></button>
          </section>
        </>
      )}
    </>
  );
}

function accountTone(status: Account['status']) {
  return status === 'working' ? 'green' : status === 'disabled' ? 'gray' : 'red';
}
const accountStatusLabel = { working: 'Working', keys_rejected: 'Keys rejected', disabled: 'Disabled' } as const;

function AccountsPage({ onOpen, confirm, showToast, showError, refreshKey }: {
  onOpen: (mode: AccountDrawerMode) => void; confirm: (c: Confirm) => void;
  showToast: (text: string) => void; showError: (e: unknown) => void; refreshKey: number;
}) {
  const list = useLoad(() => api.accounts(), [refreshKey]);
  const rowMenu = useRowMenu();
  const [busy, setBusy] = useState<string | null>(null);
  const accounts = list.data?.items ?? [];

  const run = async (id: string, fn: () => Promise<unknown>, done: string) => {
    rowMenu.close();
    setBusy(id);
    try {
      await fn();
      showToast(done);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
      void list.reload();
    }
  };

  return (
    <>
      <PageHeading title="AWS accounts" description="The AWS accounts your servers run in. Keys are encrypted before they're stored." action={<Button variant="primary" icon={<Plus size={17} />} onClick={() => onOpen({ kind: 'add' })}>Add AWS account</Button>} />
      <div className="info-banner"><span className="info-banner-icon"><Shield size={17} /></span><span>Use the <strong>veil-orchestrator</strong> IAM user (EC2 only), never root keys. The script in <code>deploy/aws/create-veil-iam-user.sh</code> creates it in CloudShell.</span></div>
      {list.error && <LoadError error={list.error} onRetry={() => void list.reload()} />}
      {accounts.some((a) => !a.credits.ok && a.credits.reason === 'missing_permission') && (
        <div className="inline-alert inline-alert-warning">
          <AlertTriangle size={16} />
          <span>To show the free credits left, the IAM user needs one more read-only permission. In the AWS console open CloudShell and run the commands in <code>deploy/aws/create-veil-iam-user.sh</code> again (it only adds permissions), then press Refresh here.</span>
        </div>
      )}
      <section className="card table-card">
        <div className="table-scroll">
          <table className="admin-table accounts-table">
            <thead><tr><th>Account</th><th>Access key</th><th>Status</th><th className="align-center">Servers</th><th>Compute this month</th><th>Data out this month</th><th aria-label="Actions" /></tr></thead>
            <tbody>{accounts.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="table-primary">{a.nickname}</div>
                  <div className="table-secondary">{a.awsAccountNumber} · {PLAN_LABELS[a.freeTierPlan]}</div>
                  <CreditsLine credits={a.credits} />
                </td>
                <td><code className="mono">{a.accessKeyHint}</code></td>
                <td>
                  <StatusPill tone={accountTone(a.status)}>{busy === a.id ? 'Checking…' : accountStatusLabel[a.status]}</StatusPill>
                  <div className="table-secondary">{a.lastError ? a.lastError : a.lastCheckedAt ? `Checked ${formatAgo(a.lastCheckedAt)}` : `Added ${formatDate(a.createdAt)}`}</div>
                </td>
                <td className="align-center">{a.serverCount}</td>
                <td><UsageMeter value={a.usage.computeHours} max={a.usage.computeLimitHours} unit="h" credits /></td>
                <td><UsageMeter value={a.usage.dataOutGb} max={a.usage.dataOutLimitGb} unit="GB" /></td>
                <td className="actions-cell">
                  <button className="icon-button table-menu-button" aria-label={`Actions for ${a.nickname}`} onClick={(e) => rowMenu.toggle(a.id, e.currentTarget)}><MoreHorizontal size={18} /></button>
                  {rowMenu.openId === a.id && (
                    <div className="row-menu" style={rowMenu.style}>
                      <button onClick={() => void run(a.id, () => api.testAccount(a.id), `${a.nickname}: AWS accepted the keys`)}>Test account</button>
                      <button onClick={() => { rowMenu.close(); onOpen({ kind: 'keys', account: a }); }}>Update keys</button>
                      <button onClick={() => { rowMenu.close(); onOpen({ kind: 'edit', account: a }); }}>Rename or change plan</button>
                      {a.status !== 'keys_rejected' && (
                        <button onClick={() => void run(a.id, () => api.patchAccount(a.id, { status: a.status === 'disabled' ? 'working' : 'disabled' }), a.status === 'disabled' ? 'Account enabled' : 'Account disabled')}>
                          {a.status === 'disabled' ? 'Enable account' : 'Disable account'}
                        </button>
                      )}
                      <button className="menu-danger" onClick={() => { rowMenu.close(); confirm({
                        title: `Remove ${a.nickname}?`,
                        text: a.serverCount > 0 ? `This account still has ${a.serverCount} server(s). Terminate them first.` : 'The stored keys are deleted. The AWS account itself is not touched.',
                        action: 'Remove account',
                        danger: true,
                        onConfirm: async () => { await api.deleteAccount(a.id); showToast('Account removed'); void list.reload(); },
                      }); }}>Remove account</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
          {list.loading && !list.data && <Loading />}
          {list.data && accounts.length === 0 && <EmptyState icon={<Cloud size={23} />} title="No AWS accounts" description="Add the veil-orchestrator IAM user's keys to start creating servers." />}
        </div>
        <div className="table-footer"><span>{accounts.length} account{accounts.length === 1 ? '' : 's'}</span><span>Usage resets monthly (UTC)</span></div>
      </section>
      <p className="page-note"><LockKeyhole size={14} />Keys are sent once over the API and stored encrypted. They are never shown again.</p>
    </>
  );
}

const MENU_HEIGHT = 190;
// A row menu that floats above the page (fixed), so the table's own scroll box never cuts it off.
// It follows its button when the page or the table scrolls.
function useRowMenu() {
  const [menu, setMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const place = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    // Below the button, or above it when the button is near the bottom of the window.
    const top = r.bottom + MENU_HEIGHT > window.innerHeight ? Math.max(8, r.top - MENU_HEIGHT) : r.bottom + 4;
    return { top, right: Math.max(8, window.innerWidth - r.right) };
  };
  useEffect(() => {
    if (!menu) return;
    const follow = () => {
      const el = anchor.current;
      if (!el || !el.isConnected) return setMenu(null);
      setMenu((m) => (m ? { ...m, ...place(el) } : m));
    };
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest?.('.row-menu, .table-menu-button')) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu?.id]);
  const toggle = (id: string, el: HTMLElement) => {
    if (menu?.id === id) {
      setMenu(null);
      return;
    }
    anchor.current = el;
    setMenu({ id, ...place(el) });
  };
  const style: React.CSSProperties | undefined = menu ? { position: 'fixed', top: menu.top, right: menu.right, zIndex: 60 } : undefined;
  return { openId: menu?.id ?? null, toggle, close: () => setMenu(null), style };
}

function CreditsLine({ credits }: { credits: Account['credits'] }) {
  const { text, tone } = creditsText(credits);
  const color = tone === 'warn' ? '#865a15' : tone === 'ok' ? '#16704e' : '#8a948f';
  return <div className="table-secondary" style={{ color, fontWeight: tone === 'muted' ? 400 : 600 }}>{text}</div>;
}

function TabBar<T extends string>({ tabs, active, onChange }: { tabs: { value: T; label: string; count?: number }[]; active: T; onChange: (value: T) => void }) {
  return <div className="tabs" role="tablist">{tabs.map((tab) => <button role="tab" aria-selected={active === tab.value} className={`tab${active === tab.value ? ' active' : ''}`} key={tab.value} onClick={() => onChange(tab.value)}>{tab.label}{tab.count !== undefined && <span>{tab.count}</span>}</button>)}</div>;
}

function serverTone(status: ServerStatus) {
  if (status === 'active') return 'green';
  if (status === 'failed') return 'red';
  if (status === 'provisioning') return 'amber';
  if (status === 'draining') return 'blue';
  return 'gray';
}
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function ServersPage({ onShowInstall, status, onStatusChange, search, onSearch, onCreate, confirm, showToast, showError, refreshKey }: {
  onShowInstall: (command: string, providerName: string, regionName: string) => void;
  status: 'all' | ServerStatus; onStatusChange: (s: 'all' | ServerStatus) => void; search: string; onSearch: (v: string) => void;
  onCreate: () => void; confirm: (c: Confirm) => void; showToast: (t: string) => void; showError: (e: unknown) => void; refreshKey: number;
}) {
  const [accountId, setAccountId] = useState('');
  const [regionCode, setRegionCode] = useState('');
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors[cursors.length - 1];
  const accounts = useLoad(() => api.accounts(), []);
  const regions = useLoad(() => api.regions(), []);
  const list = useLoad<ServerList>(
    () => api.servers({ status: status === 'all' ? undefined : status, accountId: accountId || undefined, regionCode: regionCode || undefined, cursor, limit: 50 }),
    [status, accountId, regionCode, cursor, refreshKey],
  );
  const rowMenu = useRowMenu();

  useEffect(() => setCursors([undefined]), [status, accountId, regionCode]);

  // While a server is starting or stopping, refresh every 15 seconds.
  const changing = (list.data?.items ?? []).some((s) => s.status === 'provisioning' || s.status === 'terminating');
  useEffect(() => {
    if (!changing) return;
    const t = window.setInterval(() => void list.reload(), 15_000);
    return () => window.clearInterval(t);
  }, [changing, list.reload]);

  const q = search.trim().toLowerCase();
  const rows = (list.data?.items ?? []).filter((s) => !q || `${s.id} ${s.instanceId ?? ''} ${s.regionName} ${s.regionCode} ${s.publicIp ?? ''} ${s.accountNickname ?? ''} ${s.providerName}`.toLowerCase().includes(q));
  const counts = list.data?.counts;
  const tabs: { value: 'all' | ServerStatus; label: string; count?: number }[] = [
    { value: 'all', label: 'All', count: counts?.all },
    { value: 'active', label: 'Active', count: counts?.active },
    { value: 'provisioning', label: 'Provisioning', count: counts?.provisioning },
    { value: 'draining', label: 'Draining', count: counts?.draining },
    { value: 'failed', label: 'Failed', count: counts?.failed },
  ];

  const act = (s: Server, action: 'drain' | 'undrain' | 'reboot' | 'terminate') => {
    rowMenu.close();
    const name = s.managed ? `${cityOf(s.regionName)} ${shortId(s.instanceId)}` : `${cityOf(s.regionName)} server (${s.providerName})`;
    const text = {
      drain: `${s.sessionCount} connected device(s) stay connected; no new devices are placed here.`,
      undrain: 'The server takes new connections again.',
      reboot: `${s.sessionCount} connected device(s) lose the connection for about a minute.`,
      terminate: s.managed
        ? `The EC2 instance is deleted. ${s.sessionCount} connected device(s) are disconnected. This cannot be undone.`
        : `The server is removed from Veil and ${s.sessionCount} connected device(s) are disconnected. Then delete the VPS in your ${s.providerName} account yourself, or it keeps costing money.`,
    }[action];
    confirm({
      title: `${action === 'terminate' && !s.managed ? 'Remove' : capitalize(action)} ${name}?`,
      text,
      action: action === 'terminate' && !s.managed ? 'Remove' : capitalize(action),
      danger: action === 'terminate',
      onConfirm: async () => {
        await api.serverAction(s.id, action);
        showToast(`${capitalize(action)}: done`);
        void list.reload();
      },
    });
  };

  const showInstall = async (s: Server) => {
    rowMenu.close();
    try {
      const { installCommand } = await api.newInstallCommand(s.id);
      onShowInstall(installCommand, s.providerName, s.regionName);
      void list.reload();
    } catch (e) {
      showError(e);
    }
  };

  const toggleVisible = async (s: Server, visible: boolean) => {
    try {
      await api.setServerVisible(s.id, visible);
      void list.reload();
    } catch (e) {
      showError(e);
    }
  };

  return (
    <>
      <PageHeading title="Servers" description="Every VPN server, on AWS or on any other provider." action={<Button variant="primary" icon={<Plus size={17} />} onClick={onCreate}>Create server</Button>} />
      {list.error && <LoadError error={list.error} onRetry={() => void list.reload()} />}
      <section className="card table-card">
        <div className="table-toolbar">
          <TabBar tabs={tabs} active={status} onChange={onStatusChange} />
          <div className="filter-group">
            <label className="table-search server-search"><Search size={14} /><input aria-label="Search servers" placeholder="Search server, region, IP" value={search} onChange={(event) => onSearch(event.target.value)} />{search && <button aria-label="Clear server search" onClick={() => onSearch('')}><X size={14} /></button>}</label>
            <label className="select-wrap"><Filter size={14} /><select aria-label="Filter by account" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">All accounts</option>{(accounts.data?.items ?? []).map((a) => <option key={a.id} value={a.id}>{a.nickname}</option>)}</select><ChevronDown size={14} /></label>
            <label className="select-wrap"><select aria-label="Filter by region" value={regionCode} onChange={(event) => setRegionCode(event.target.value)}><option value="">All regions</option>{(regions.data?.items ?? []).map((r) => <option key={r.code} value={r.code}>{cityOf(r.displayName)}</option>)}</select><ChevronDown size={14} /></label>
          </div>
        </div>
        <div className="table-scroll">
          <table className="admin-table servers-table">
            <thead><tr><th>Server</th><th>Account</th><th>Public IP</th><th>Status</th><th className="align-right">Devices</th><th className="align-right">CPU</th><th className="align-right">Uptime</th><th>In app</th><th aria-label="Actions" /></tr></thead>
            <tbody>{rows.map((s) => (
              <tr key={s.id}>
                <td><div className="table-primary">{cityOf(s.regionName)}</div><div className="table-secondary mono">{s.managed ? `${shortId(s.instanceId)} · ${s.regionCode} · ${s.instanceType}` : `${s.regionCode} · added by hand`}</div></td>
                <td>{s.managed ? s.accountNickname : <><div>{s.providerName}</div><div className="table-secondary">Any provider</div></>}</td><td className="mono">{s.publicIp ?? '—'}</td>
                <td>
                  <StatusPill tone={serverTone(s.status)}>{capitalize(s.status)}</StatusPill>
                  {s.status === 'failed' && <div className="table-secondary" title={s.failDetail ?? ''}>{s.failReason?.replace(/_/g, ' ')}</div>}
                  {s.status === 'provisioning' && <div className="table-secondary">{s.managed ? `Started ${formatAgo(s.launchedAt)}` : `Waiting for install · added ${formatAgo(s.launchedAt).toLowerCase()}`}</div>}
                </td>
                <td className="align-right">{s.sessionCount}</td><td className="align-right">{s.cpuPct === null ? '—' : `${Math.round(s.cpuPct)}%`}</td><td className="align-right">{formatUptime(s.uptimeSeconds)}</td>
                <td><Toggle checked={s.visible} label={`Show ${cityOf(s.regionName)} server in the app`} onChange={(v) => void toggleVisible(s, v)} disabled={s.status === 'terminating' || s.status === 'terminated'} /></td>
                <td className="actions-cell">
                  {s.status !== 'terminating' && s.status !== 'terminated' && (
                    <button className="icon-button table-menu-button" aria-label={`Actions for ${s.instanceId ?? s.id}`} onClick={(e) => rowMenu.toggle(s.id, e.currentTarget)}><MoreHorizontal size={18} /></button>
                  )}
                  {rowMenu.openId === s.id && (
                    <div className="row-menu" style={rowMenu.style}>
                      {s.status === 'active' && <button onClick={() => act(s, 'drain')}>Drain server</button>}
                      {s.status === 'draining' && <button onClick={() => act(s, 'undrain')}>Undrain server</button>}
                      {s.managed && s.instanceId && ['active', 'draining', 'failed'].includes(s.status) && <button onClick={() => act(s, 'reboot')}>Reboot server</button>}
                      {!s.managed && (s.status === 'provisioning' || (s.status === 'failed' && s.failReason === 'never_registered')) && <button onClick={() => void showInstall(s)}>Show install command</button>}
                      <button className="menu-danger" onClick={() => act(s, 'terminate')}>{s.managed ? 'Terminate server' : 'Remove server'}</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
          {list.loading && !list.data && <Loading />}
          {list.data && rows.length === 0 && <EmptyState icon={<ServerIcon size={23} />} title="No servers found" description="Change the filters or create a server to get started." />}
        </div>
        <div className="table-footer">
          <span>{rows.length} shown · {list.data?.total ?? 0} total{changing ? ' · refreshing every 15 s' : ''}</span>
          <div className="pagination">
            <button disabled={cursors.length === 1} onClick={() => setCursors((c) => c.slice(0, -1))}><ChevronLeft size={15} />Previous</button>
            <span>Page {cursors.length}</span>
            <button disabled={!list.data?.nextCursor} onClick={() => setCursors((c) => [...c, list.data!.nextCursor!])}>Next<ChevronRight size={15} /></button>
          </div>
        </div>
      </section>
      <p className="page-note"><ShieldAlert size={14} />Terminating a live server affects connected users. Drain first so sessions end gracefully.</p>
    </>
  );
}

function Toggle({ checked, label, onChange, disabled = false }: { checked: boolean; label: string; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <button aria-label={label} aria-pressed={checked} disabled={disabled} className={`toggle${checked ? ' checked' : ''}`} onClick={() => onChange(!checked)}><i /></button>;
}

function RegionsPage({ showToast, showError }: { showToast: (t: string) => void; showError: (e: unknown) => void }) {
  const list = useLoad(() => api.regions(), []);
  const [draft, setDraft] = useState<Region[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (list.data) setDraft(list.data.items);
  }, [list.data]);
  const changed = useMemo(
    () => draft.filter((r) => {
      const orig = list.data?.items.find((o) => o.code === r.code);
      return orig && (orig.displayName !== r.displayName || orig.visible !== r.visible);
    }),
    [draft, list.data],
  );
  const invalid = draft.some((r) => !r.displayName.trim() || r.displayName.length > 60);
  const change = (code: string, updates: Partial<Region>) => setDraft((c) => c.map((r) => (r.code === code ? { ...r, ...updates } : r)));
  const save = async () => {
    setBusy(true);
    try {
      const saved = await api.saveRegions(changed.map((r) => ({ code: r.code, displayName: r.displayName.trim(), visible: r.visible })));
      list.setData(saved);
      showToast('Regions saved');
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading title="Regions" description="Choose which locations appear in the app and how they're named. Hiding a region keeps its servers running." action={<Button variant="primary" icon={<Check size={16} />} onClick={() => void save()} disabled={changed.length === 0 || invalid || busy}>{busy ? 'Saving…' : 'Save changes'}</Button>} />
      {list.error && <LoadError error={list.error} onRetry={() => void list.reload()} />}
      {changed.length > 0 && <div className="inline-alert inline-alert-warning"><AlertTriangle size={16} />{changed.length} unsaved change{changed.length === 1 ? '' : 's'}.{invalid && ' Names must be 1–60 characters.'}</div>}
      <section className="card table-card">
        <div className="table-scroll">
          <table className="admin-table regions-table">
            <thead><tr><th>Name in app</th><th>AWS region</th><th className="align-center">Active servers</th><th>Visible to users</th><th>Shown in app</th></tr></thead>
            <tbody>{draft.map((r) => {
              const live = r.visible && r.activeServers > 0;
              return (
                <tr key={r.code}>
                  <td><div className="region-name-input"><span className="region-flag">{r.countryCode}</span><input aria-label={`Display name for ${r.code}`} value={r.displayName} maxLength={60} onChange={(event) => change(r.code, { displayName: event.target.value })} /></div></td>
                  <td className="mono">{r.code}</td><td className="align-center">{r.activeServers}</td>
                  <td>{live ? <span className="visibility-yes"><CheckCircle2 size={15} />Yes</span> : <span className="muted-text">{r.visible ? 'No, no active servers' : 'No, hidden'}</span>}</td>
                  <td><Toggle checked={r.visible} label={`Show ${r.displayName} in the app`} onChange={(visible) => change(r.code, { visible })} /></td>
                </tr>
              );
            })}</tbody>
          </table>
          {list.loading && !list.data && <Loading />}
        </div>
        <div className="table-footer"><span>A region appears in the app only when it is shown and has at least one active server.</span><span>{draft.length} regions</span></div>
      </section>
    </>
  );
}

function DevicesPage({ query, onQuery, onOpenDevice, refreshKey }: {
  query: string; onQuery: (q: string) => void; onOpenDevice: (id: string) => void; refreshKey: number;
}) {
  const [status, setStatus] = useState<'all' | 'connected' | 'offline' | 'blocked'>('all');
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [input, setInput] = useState(query);
  const cursor = cursors[cursors.length - 1];
  const validQuery = UUID_RE.test(query.trim()) ? query.trim() : '';
  const list = useLoad<DeviceList>(() => api.devices({ status, q: validQuery || undefined, cursor, limit: 50 }), [status, validQuery, cursor, refreshKey]);
  useEffect(() => setCursors([undefined]), [status, validQuery]);
  useEffect(() => setInput(query), [query]);
  const typed = input.trim();
  const partial = typed !== '' && !UUID_RE.test(typed);
  const counts = list.data?.counts;
  const items = list.data?.items ?? [];

  return (
    <>
      <PageHeading title="Devices" description="Shows each device's current state only. Connection history and traffic are never stored." />
      {list.error && <LoadError error={list.error} onRetry={() => void list.reload()} />}
      <section className="card table-card">
        <div className="table-toolbar device-toolbar">
          <TabBar
            tabs={[
              { value: 'all', label: 'All', count: counts?.all },
              { value: 'connected', label: 'Connected', count: counts?.connected },
              { value: 'offline', label: 'Offline', count: counts?.offline },
              { value: 'blocked', label: 'Blocked', count: counts?.blocked },
            ]}
            active={status}
            onChange={setStatus}
          />
          <form className="table-search" onSubmit={(e) => { e.preventDefault(); onQuery(typed); }}>
            <Search size={15} />
            <input aria-label="Search by full device ID" placeholder="Paste a full device ID" value={input} onChange={(event) => { setInput(event.target.value); if (!event.target.value) onQuery(''); }} />
            {input && <button type="button" aria-label="Clear search" onClick={() => { setInput(''); onQuery(''); }}><X size={15} /></button>}
          </form>
        </div>
        {partial && <div className="inline-alert inline-alert-warning" style={{ margin: '0 14px 10px' }}><AlertTriangle size={16} />Only a full device ID (36 characters, from the app's Settings screen) can be searched. Press Enter to search.</div>}
        <div className="table-scroll">
          <table className="admin-table devices-table">
            <thead><tr><th>Device ID</th><th>Status</th><th className="align-right">Balance</th><th>First seen</th><th>Last seen</th><th aria-label="Open details" /></tr></thead>
            <tbody>{items.map((d) => (
              <tr className="clickable-row" key={d.id} onClick={() => onOpenDevice(d.id)}>
                <td className="mono table-primary" title={d.id}>{shortDevice(d.id)}</td>
                <td><DeviceState status={d.status} session={d.session} /></td>
                <td className={`align-right${d.balanceSeconds === 0 ? ' balance-zero' : ''}`}>{formatBalance(d.balanceSeconds)}</td>
                <td>{formatDate(d.firstSeenAt)}</td><td>{formatAgo(d.lastSeenAt)}</td>
                <td><button className="icon-button open-device-button" aria-label={`View device ${d.id}`}><ChevronRight size={17} /></button></td>
              </tr>
            ))}</tbody>
          </table>
          {list.loading && !list.data && <Loading />}
          {list.data && items.length === 0 && <EmptyState icon={<Smartphone size={23} />} title="No devices match" description={validQuery ? 'No device has this ID.' : 'No devices in this tab yet.'} />}
        </div>
        <div className="table-footer">
          <span>{items.length} shown · {formatNumber(list.data?.total ?? 0)} total</span>
          <div className="pagination">
            <button disabled={cursors.length === 1} onClick={() => setCursors((c) => c.slice(0, -1))}><ChevronLeft size={15} />Previous</button>
            <span>Page {cursors.length}</span>
            <button disabled={!list.data?.nextCursor} onClick={() => setCursors((c) => [...c, list.data!.nextCursor!])}>Next<ChevronRight size={15} /></button>
          </div>
        </div>
      </section>
      <p className="page-note"><LockKeyhole size={14} />No websites, browsing activity, or traffic history is collected.</p>
    </>
  );
}

function DeviceState({ status, session }: { status: DeviceDetail['status']; session: DeviceDetail['session'] }) {
  if (status === 'connected' && session) return <StatusPill tone="green">Connected · {session.regionCode} · {session.protocol.toUpperCase()}</StatusPill>;
  return <StatusPill tone={status === 'blocked' ? 'red' : 'gray'}>{capitalize(status)}</StatusPill>;
}

function RewardsPage({ onReview }: { onReview: (id: string) => void }) {
  const [days, setDays] = useState(14);
  const summary = useLoad<RewardsSummary>(() => api.rewards(days), [days]);
  const settings = useLoad(() => api.settings(), []);
  const s = summary.data;
  const max = Math.max(1, ...(s?.daily ?? []).map((d) => d.credited));
  const avg = s ? Math.round(s.daily.reduce((sum, d) => sum + d.credited, 0) / s.daily.length) : 0;
  // At least 3 so the three gridlines never show repeated labels like "1, 1, 0".
  const top = Math.max(3, max);
  const gridlines = [1, 2 / 3, 1 / 3].map((f) => Math.round(top * f));
  return (
    <>
      <PageHeading title="Rewards" description="Minutes are granted only after AdMob's server confirms the ad was watched." action={<span className="verified-label"><ShieldCheck size={15} />Server-side verified</span>} />
      {summary.error && <LoadError error={summary.error} onRetry={() => void summary.reload()} />}
      {!s && !summary.error && <Loading />}
      {s && (
        <>
          <div className="metric-grid rewards-metrics">
            <MetricCard label="Ads watched today" value={formatNumber(s.today.adsCredited)} note="Verified callbacks since 00:00 UTC" icon={Play} />
            <MetricCard label="Minutes granted today" value={formatNumber(s.today.minutesGranted)} note={settings.data ? `${settings.data.minutesPerAd} minutes per ad` : 'From verified ads'} icon={Clock3} accent />
            <MetricCard label="Devices that watched" value={formatNumber(s.today.devicesWatched)} note={s.today.devicesWatched ? `${(s.today.adsCredited / s.today.devicesWatched).toFixed(1)} ads per device` : 'None yet today'} icon={Smartphone} />
            <MetricCard label="Rejected today" value={formatNumber(s.today.rejected)} note="No minutes granted" icon={ShieldAlert} />
          </div>
          <section className="card chart-card">
            <div className="card-header"><div><h2>Verified ads per day</h2><p>Daily totals only · no individual activity history</p></div><div className="chart-controls"><span className="chart-average">Avg <strong>{formatNumber(avg)}</strong> / day</span><label className="select-wrap"><select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Select chart range"><option value={14}>14 days</option><option value={7}>7 days</option><option value={30}>30 days</option></select><ChevronDown size={14} /></label></div></div>
            <div className="bar-chart" role="img" aria-label={`Bar chart of verified ads over the last ${days} days`}>
              <div className="chart-gridline gridline-one"><span>{formatNumber(gridlines[0]!)}</span></div><div className="chart-gridline gridline-two"><span>{formatNumber(gridlines[1]!)}</span></div><div className="chart-gridline gridline-three"><span>{formatNumber(gridlines[2]!)}</span></div>
              {s.daily.map((d, i) => (
                <div className="chart-bar-column" key={d.day}>
                  <span className="chart-bar-value">{formatNumber(d.credited)}</span><i className={i === s.daily.length - 1 ? 'today-bar' : ''} style={{ height: `${Math.max((d.credited / max) * 78, 2)}%` }} /><span className="chart-bar-label">{chartLabel(d.day, i, s.daily.length)}</span>
                </div>
              ))}
            </div>
          </section>
          <div className="dashboard-grid rewards-bottom">
            <section className="card rejects-card">
              <div className="card-header"><div><h2>Rejected callbacks today</h2><p>None of these granted minutes.</p></div></div>
              {[
                { title: 'Duplicate transaction', detail: 'The same ad callback was sent again', count: s.rejects.duplicate, tone: 'amber' },
                { title: 'Invalid signature', detail: 'Not signed by AdMob', count: s.rejects.bad_signature, tone: 'red' },
                { title: 'Over daily limit', detail: `Device had already watched ${settings.data?.maxAdsPerDay ?? 'the maximum'} ads`, count: s.rejects.daily_limit, tone: 'gray' },
                { title: 'Other checks', detail: 'Wrong ad unit, too old, unknown device or no matching request', count: s.rejects.other, tone: 'gray' },
              ].map((row) => <div className="reject-row" key={row.title}><div><strong>{row.title}</strong><span>{row.detail}</span></div><span className={`count-badge ${row.tone}`}>{formatNumber(row.count)}</span></div>)}
            </section>
            <section className="card suspicious-card">
              <div className="card-header"><div><h2>Most ads today</h2><p>Many reinstalls with maximum ads can indicate reward farming.</p></div>{settings.data && <span className="muted-text">Daily limit is {settings.data.maxAdsPerDay}</span>}</div>
              <div className="table-scroll"><table className="admin-table">
                <thead><tr><th>Device ID</th><th className="align-right">Ads today</th><th className="align-right">Installs</th><th /></tr></thead>
                <tbody>{s.topDevices.map((d) => <tr key={d.deviceId}><td className="mono" title={d.deviceId}>{shortDevice(d.deviceId)}</td><td className="align-right">{d.adsToday}</td><td className={`align-right${d.installCount > 2 ? ' text-danger' : ''}`}>{d.installCount}</td><td><button className="inline-link" onClick={() => onReview(d.deviceId)}>Review <ArrowRight size={14} /></button></td></tr>)}</tbody>
              </table>{s.topDevices.length === 0 && <p className="muted-text" style={{ padding: 14 }}>No ads watched today.</p>}</div>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function SettingsPage({ me, refreshMe, showToast }: { me: AdminMe; refreshMe: () => Promise<void>; showToast: (t: string) => void }) {
  const loaded = useLoad(() => api.settings(), []);
  const [form, setForm] = useState<Record<keyof Omit<Settings, 'updatedAt'>, string> | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const s = loaded.data;
    if (s) {
      setForm({
        minutesPerAd: String(s.minutesPerAd),
        starterMinutes: String(s.starterMinutes),
        dailyFreeMinutes: String(s.dailyFreeMinutes),
        maxAdsPerDay: String(s.maxAdsPerDay),
        lowMinutesWarning: String(s.lowMinutesWarning),
        defaultProtocol: s.defaultProtocol,
        supportEmail: s.supportEmail ?? '',
      });
    }
  }, [loaded.data]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    const num = (v: string) => Number(v);
    const body: Settings = {
      minutesPerAd: num(form.minutesPerAd),
      starterMinutes: num(form.starterMinutes),
      dailyFreeMinutes: num(form.dailyFreeMinutes),
      maxAdsPerDay: num(form.maxAdsPerDay),
      lowMinutesWarning: num(form.lowMinutesWarning),
      defaultProtocol: form.defaultProtocol as Settings['defaultProtocol'],
      supportEmail: form.supportEmail.trim() || null,
    };
    const bad = [
      ['Minutes per ad', body.minutesPerAd, 1, 240],
      ['Starter minutes', body.starterMinutes, 0, 1440],
      ['Free minutes every day', body.dailyFreeMinutes, 0, 1440],
      ['Ads per device per day', body.maxAdsPerDay, 1, 100],
      ['Low-minutes warning', body.lowMinutesWarning, 1, 120],
    ].find(([, v, lo, hi]) => !Number.isInteger(v) || (v as number) < (lo as number) || (v as number) > (hi as number));
    if (bad) {
      setNotice({ tone: 'error', text: `${bad[0]} must be a whole number from ${bad[2]} to ${bad[3]}.` });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      loaded.setData(await api.saveSettings(body));
      showToast('Settings saved');
    } catch (e) {
      setNotice({ tone: 'error', text: errorText(e) });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof NonNullable<typeof form>, value: string) => setForm((f) => (f ? { ...f, [key]: value } : f));

  return (
    <>
      <PageHeading title="Settings" description="Changes reach every device the next time its app refreshes." action={<span className="settings-apply-note"><i />Applied to app defaults</span>} />
      {loaded.error && <LoadError error={loaded.error} onRetry={() => void loaded.reload()} />}
      {!form && !loaded.error && <Loading />}
      {form && (
        <form className="settings-form" onSubmit={(e) => void save(e)}>
          <SettingsSection title="Minutes and rewards" description="How users earn and spend VPN time.">
            <div className="settings-grid">
              <NumberField label="Minutes per ad" suffix="min" help="Credited after AdMob confirms the ad." value={form.minutesPerAd} min="1" max="240" onChange={(v) => set('minutesPerAd', v)} />
              <NumberField label="Starter minutes" suffix="min" help="Given once per phone, on the first install." value={form.starterMinutes} min="0" max="1440" onChange={(v) => set('starterMinutes', v)} />
              <NumberField label="Free minutes every day" suffix="min" help="Each day (UTC) every phone is filled up to this. 0 turns it off." value={form.dailyFreeMinutes} min="0" max="1440" onChange={(v) => set('dailyFreeMinutes', v)} />
              <NumberField label="Ads per device per day" suffix="ads" help="Caps how much free time one device can earn." value={form.maxAdsPerDay} min="1" max="100" onChange={(v) => set('maxAdsPerDay', v)} />
              <NumberField label="Low-minutes warning" suffix="min" help="When the app shows its warning banner." value={form.lowMinutesWarning} min="1" max="120" onChange={(v) => set('lowMinutesWarning', v)} />
            </div>
          </SettingsSection>
          <SettingsSection title="App defaults" description="What new devices start with.">
            <div className="settings-fields">
              <label className="form-field settings-narrow">Default protocol<select value={form.defaultProtocol} onChange={(event) => set('defaultProtocol', event.target.value)}><option value="auto">Auto</option><option value="udp">UDP</option><option value="tcp">TCP</option></select><span>Auto uses UDP and switches to TCP when a network blocks UDP.</span></label>
              <label className="form-field settings-narrow">Support email<input type="email" value={form.supportEmail} onChange={(event) => set('supportEmail', event.target.value)} placeholder="support@example.com" /><span>Shown on the app's blocked and help screens. Leave empty to hide.</span></label>
            </div>
          </SettingsSection>
          {notice && <Notice notice={notice} />}
          <div className="settings-submit"><span>{loaded.data?.updatedAt ? `Last saved ${formatAgo(loaded.data.updatedAt)}` : 'Changes are saved for the next app refresh.'}</span><Button type="submit" variant="primary" icon={<Check size={16} />} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button></div>
        </form>
      )}
      <SettingsSection title="Security" description="Protect the account that controls your AWS keys.">
        <div className="security-card">
          <TwoFactorRow me={me} refreshMe={refreshMe} showToast={showToast} />
          <PasswordRow me={me} refreshMe={refreshMe} showToast={showToast} />
        </div>
      </SettingsSection>
    </>
  );
}

function TwoFactorRow({ me, refreshMe, showToast }: { me: AdminMe; refreshMe: () => Promise<void>; showToast: (t: string) => void }) {
  const [setup, setSetup] = useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice({ tone: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const reset = () => { setSetup(null); setDisabling(false); setCode(''); setPassword(''); setNotice(null); };

  return (
    <>
      <div className="security-row">
        <div className="security-icon"><LockKeyhole size={18} /></div>
        <div className="security-copy"><strong>Two-factor authentication</strong><span>{me.totpEnabled ? 'On. An authenticator code is required at sign-in.' : 'Off. Turn it on to add a second sign-in step.'}</span></div>
        {me.totpEnabled
          ? <Button onClick={() => (disabling ? reset() : setDisabling(true))}>{disabling ? 'Cancel' : 'Turn off'}</Button>
          : <Button variant="primary" disabled={busy} onClick={() => (setup ? reset() : void go(async () => setSetup(await api.totpSetup())))}>{setup ? 'Cancel' : 'Set up'}</Button>}
      </div>
      {setup && (
        <div className="password-change">
          <p className="muted-text">In Google Authenticator, Microsoft Authenticator or 1Password, choose <strong>Enter a setup key</strong> and type this key (time-based):</p>
          <code className="mono" style={{ fontSize: 14, letterSpacing: 2, wordBreak: 'break-all' }}>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
          <p className="muted-text">Account name: Veil Admin ({me.email}). Then enter the 6-digit code it shows.</p>
          <label className="form-field">Code from the app<input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" /></label>
          {notice && <Notice notice={notice} />}
          <Button variant="primary" disabled={busy || code.length !== 6} onClick={() => void go(async () => { await api.totpEnable(code); reset(); await refreshMe(); showToast('Two-factor authentication is on'); })}>Turn on</Button>
        </div>
      )}
      {disabling && (
        <div className="password-change">
          <label className="form-field">Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <label className="form-field">Code from the app<input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" /></label>
          {notice && <Notice notice={notice} />}
          <Button variant="danger" disabled={busy || !password || code.length !== 6} onClick={() => void go(async () => { await api.totpDisable(password, code); reset(); await refreshMe(); showToast('Two-factor authentication is off'); })}>Turn off 2FA</Button>
        </div>
      )}
    </>
  );
}

function PasswordRow({ me, refreshMe, showToast }: { me: AdminMe; refreshMe: () => Promise<void>; showToast: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (next.length < 12) {
      setNotice({ tone: 'error', text: 'The new password needs at least 12 characters.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await api.changePassword(current, next);
      setOpen(false);
      setCurrent('');
      setNext('');
      await refreshMe();
      showToast('Password changed. Other sessions were signed out.');
    } catch (e) {
      setNotice({ tone: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="security-row"><div className="security-icon"><KeyRound size={18} /></div><div className="security-copy"><strong>Password</strong><span>Last changed {formatAgo(me.passwordChangedAt).toLowerCase()}</span></div><Button onClick={() => { setOpen((c) => !c); setNotice(null); }}>{open ? 'Cancel' : 'Change password'}</Button></div>
      {open && (
        <div className="password-change">
          <label className="form-field">Current password<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
          <label className="form-field">New password<input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 12 characters" /></label>
          {notice && <Notice notice={notice} />}
          <Button variant="primary" disabled={busy || !current || !next} onClick={() => void submit()}>{busy ? 'Saving…' : 'Update password'}</Button>
        </div>
      )}
    </>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="settings-section"><div className="settings-section-heading"><h2>{title}</h2><p>{description}</p></div><div className="settings-panel">{children}</div></section>;
}

function NumberField({ label, suffix, help, value, min, max, onChange }: { label: string; suffix: string; help: string; value: string; min: string; max: string; onChange: (value: string) => void }) {
  return <label className="form-field">{label}<span className="input-suffix"><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} /><i>{suffix}</i></span><span>{help}</span></label>;
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{description}</p></div>;
}

function DrawerHeader({ title, description, onClose, badge }: { title: string; description?: string; onClose: () => void; badge?: React.ReactNode }) {
  return <div className="drawer-header"><div>{badge && <div className="drawer-badge">{badge}</div>}<h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" aria-label="Close panel" onClick={onClose}><X size={19} /></button></div>;
}

function DrawerField({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return <label className="form-field">{label}{children}{help && <span>{help}</span>}</label>;
}

function Notice({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const Icon = notice.tone === 'success' ? CheckCircle2 : AlertTriangle;
  return <div className={`inline-alert inline-alert-${notice.tone}`}><Icon size={16} /><span>{notice.text}</span></div>;
}

function AccountDrawer({ mode, onClose, onSaved }: { mode: AccountDrawerMode; onClose: () => void; onSaved: (text: string) => void }) {
  const account = mode.kind === 'add' ? null : mode.account;
  const [nickname, setNickname] = useState(account?.nickname ?? '');
  const [plan, setPlan] = useState<FreeTierPlan>(account?.freeTierPlan ?? 'free_plan_credits');
  const [keyId, setKeyId] = useState('');
  const [secret, setSecret] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [tested, setTested] = useState<KeyTest | null>(null);
  const [busy, setBusy] = useState(false);
  const needsKeys = mode.kind !== 'edit';
  const keysValid = /^AKIA[0-9A-Z]{16}$/.test(keyId.trim()) && secret.trim().length === 40;

  const test = async () => {
    if (!keysValid) {
      setNotice({ tone: 'error', text: 'The access key ID starts with AKIA and has 20 characters; the secret has 40.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const r = await api.testKeys(keyId.trim(), secret.trim());
      setTested(r);
      setNotice({ tone: 'success', text: `AWS account ${r.awsAccountNumber}: ${r.regions.length} regions enabled; free-tier types ${r.freeTierTypes.join(', ') || 'none'}.` });
    } catch (e) {
      setTested(null);
      setNotice({ tone: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode.kind !== 'keys' && (!nickname.trim() || nickname.trim().length > 40)) {
      setNotice({ tone: 'error', text: 'Enter a nickname of 1–40 characters.' });
      return;
    }
    if (needsKeys && !keysValid) {
      setNotice({ tone: 'error', text: 'The access key ID starts with AKIA and has 20 characters; the secret has 40.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      if (mode.kind === 'add') {
        await api.addAccount({ nickname: nickname.trim(), accessKeyId: keyId.trim(), secretAccessKey: secret.trim(), freeTierPlan: plan });
        onSaved('AWS account added');
      } else if (mode.kind === 'keys') {
        await api.updateKeys(mode.account.id, keyId.trim(), secret.trim());
        onSaved('Keys updated');
      } else {
        await api.patchAccount(mode.account.id, { nickname: nickname.trim(), freeTierPlan: plan });
        onSaved('Account saved');
      }
    } catch (e) {
      setNotice({ tone: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const title = mode.kind === 'add' ? 'Add AWS account' : mode.kind === 'keys' ? `Update keys · ${account!.nickname}` : `Edit ${account!.nickname}`;
  return (
    <form className="drawer-form" onSubmit={(e) => void submit(e)}>
      <DrawerHeader title={title} description={mode.kind === 'keys' ? 'The new keys must belong to the same AWS account.' : 'Use the veil-orchestrator IAM user. Never root keys.'} onClose={onClose} badge={<Cloud size={17} />} />
      <div className="drawer-body">
        {mode.kind !== 'keys' && (
          <>
            <DrawerField label="Nickname" help="Only you see this."><input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Main" maxLength={40} /></DrawerField>
            <DrawerField label="AWS plan" help="Sets the free limits shown on the dashboard. New AWS accounts are on the Free plan (credits).">
              <select value={plan} onChange={(e) => setPlan(e.target.value as FreeTierPlan)}>
                {(Object.keys(PLAN_LABELS) as FreeTierPlan[]).map((p) => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
              </select>
            </DrawerField>
          </>
        )}
        {needsKeys && (
          <>
            <div className="inline-alert inline-alert-warning"><ShieldAlert size={16} /><span>Never use root account keys.</span></div>
            <DrawerField label="Access key ID" help="Starts with AKIA."><input value={keyId} onChange={(e) => { setKeyId(e.target.value); setTested(null); }} placeholder="AKIA…" autoComplete="off" spellCheck={false} /></DrawerField>
            <DrawerField label="Secret access key" help="AWS shows the secret only once, when you create the key."><input value={secret} onChange={(e) => { setSecret(e.target.value); setTested(null); }} type="password" placeholder="Paste secret access key" autoComplete="new-password" /></DrawerField>
            <button className="button button-secondary test-keys" type="button" onClick={() => void test()} disabled={busy}><Activity size={16} />{busy ? 'Checking with AWS…' : 'Test credentials'}</button>
          </>
        )}
        <Notice notice={notice} />
        {needsKeys && <div className="drawer-info-list"><span><CheckCircle2 size={16} />{tested ? `Account ${tested.awsAccountNumber}` : 'AWS identity checked'}</span><span><CheckCircle2 size={16} />Free-tier server types listed</span><span><LockKeyhole size={16} />Stored encrypted, never shown again</span></div>}
      </div>
      <div className="drawer-footer"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" icon={<Check size={16} />} disabled={busy}>{busy ? 'Saving…' : mode.kind === 'add' ? 'Save account' : 'Save'}</Button></div>
    </form>
  );
}

function ServerDrawer({ onClose, onCreated, onManualCreated }: {
  onClose: () => void;
  onCreated: (text: string) => void;
  onManualCreated: (command: string, providerName: string, regionName: string) => void;
}) {
  const [kind, setKind] = useState<'aws' | 'manual'>('manual');
  const accounts = useLoad(() => api.accounts(), []);
  const working = (accounts.data?.items ?? []).filter((a) => a.status === 'working');
  const [accountId, setAccountId] = useState('');
  const [region, setRegion] = useState('');
  const [type, setType] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!accountId && working[0]) setAccountId(working[0].id);
  }, [accountId, working]);
  const regions = useLoad(() => (accountId ? api.accountRegions(accountId) : Promise.resolve({ items: [] })), [accountId]);
  useEffect(() => {
    const items = regions.data?.items ?? [];
    if (items.length && !items.some((r) => r.code === region)) setRegion(items[0]!.code);
  }, [regions.data, region]);
  const types = useLoad(() => (accountId && region ? api.instanceTypes(accountId, region) : Promise.resolve({ items: [] })), [accountId, region]);
  useEffect(() => setType(''), [accountId, region]);
  const account = working.find((a) => a.id === accountId);

  const allRegions = useLoad(() => api.regions(), []);
  const [providerName, setProviderName] = useState('Contabo');
  const [manualRegion, setManualRegion] = useState('');
  useEffect(() => {
    const first = allRegions.data?.items[0];
    if (!manualRegion && first) setManualRegion(first.code);
  }, [allRegions.data, manualRegion]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (kind === 'manual') {
      if (!providerName.trim() || !manualRegion) return;
      setBusy(true);
      setNotice(null);
      try {
        const out = await api.createManualServer(manualRegion, providerName.trim());
        onManualCreated(out.installCommand, out.server.providerName, out.server.regionName);
      } catch (e) {
        setNotice({ tone: 'error', text: errorText(e) });
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!accountId || !region) return;
    setBusy(true);
    setNotice(null);
    try {
      await api.createServer(accountId, region, type || undefined);
      onCreated('Server launching. It turns Active in about 1–4 minutes.');
    } catch (e) {
      setNotice({ tone: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const usageHint = account
    ? account.usage.computeLimitHours === null
      ? `${account.usage.computeHours} h used this month (paid from credits).`
      : `${Math.max(0, Math.round(account.usage.computeLimitHours - account.usage.computeHours))} free compute hours left this month.`
    : '';

  return (
    <form className="drawer-form" onSubmit={(e) => void submit(e)}>
      <DrawerHeader title="Create server" description="Add a VPN server: on any provider with one command, or launched on AWS automatically." onClose={onClose} badge={<ServerIcon size={17} />} />
      <div className="drawer-body">
        <fieldset className="instance-options">
          <legend>Where</legend>
          <label><input type="radio" name="serverKind" checked={kind === 'manual'} onChange={() => setKind('manual')} /><span><strong>Any provider</strong><small>Contabo, Hetzner, Oracle, … You rent the VPS; Veil gives one install command.</small></span><em>Cheapest</em></label>
          <label><input type="radio" name="serverKind" checked={kind === 'aws'} onChange={() => setKind('aws')} /><span><strong>AWS, automatic</strong><small>Veil launches and removes the EC2 instance itself.</small></span><em>Uses AWS</em></label>
        </fieldset>
        {kind === 'manual' && (
          <>
            <DrawerField label="Provider name" help="Only for you, so you know where this server lives."><input value={providerName} maxLength={40} onChange={(e) => setProviderName(e.target.value)} placeholder="e.g. Contabo" /></DrawerField>
            <DrawerField label="Location shown in the app" help="Pick the region closest to where the VPS really is.">
              <select value={manualRegion} onChange={(e) => setManualRegion(e.target.value)}>{(allRegions.data?.items ?? []).map((r) => <option value={r.code} key={r.code}>{r.displayName} ({r.code})</option>)}</select>
            </DrawerField>
            <div className="next-steps"><strong>What you need</strong><span><i>1</i>A VPS with a fresh Ubuntu 22.04/24.04 or Debian 12 and a public IPv4 address.</span><span><i>2</i>Nothing else on ports UDP 51820 and TCP 443.</span><span><i>3</i>Next screen: copy one command, paste it into the VPS over SSH. It turns Active in about 2 minutes.</span></div>
          </>
        )}
        {kind === 'aws' && accounts.error && <Notice notice={{ tone: 'error', text: accounts.error }} />}
        {kind === 'aws' && (accounts.data && working.length === 0 ? <div className="inline-alert inline-alert-error"><AlertTriangle size={16} />Add a working AWS account before creating a server.</div> : (
          <>
            <DrawerField label="AWS account" help={usageHint}><select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{working.map((a) => <option key={a.id} value={a.id}>{a.nickname}</option>)}</select></DrawerField>
            <DrawerField label="Region" help={regions.loading ? 'Asking AWS which regions are enabled…' : regions.error || undefined}>
              <select value={region} onChange={(e) => setRegion(e.target.value)} disabled={!regions.data?.items.length}>{(regions.data?.items ?? []).map((r) => <option value={r.code} key={r.code}>{r.displayName} ({r.code})</option>)}</select>
            </DrawerField>
            <fieldset className="instance-options">
              <legend>Instance type</legend>
              <label><input type="radio" name="instanceType" checked={type === ''} onChange={() => setType('')} /><span><strong>Automatic</strong><small>t3.micro, else t2.micro, else the first free type</small></span><em>Recommended</em></label>
              {types.loading && <p className="muted-text">Loading free-tier types…</p>}
              {types.error && <p className="muted-text">{types.error}</p>}
              {(types.data?.items ?? []).map((t) => <label key={t}><input type="radio" name="instanceType" checked={type === t} onChange={() => setType(t)} /><span><strong>{t}</strong><small>{t.includes('micro') ? 'Small and cheapest' : 'Uses free credits faster'}</small></span><em>Free tier</em></label>)}
            </fieldset>
            <div className="next-steps"><strong>What happens next</strong><span><i>1</i>The instance launches with only UDP 51820 and TCP 443 open, no SSH.</span><span><i>2</i>On first boot it installs WireGuard and the Veil agent.</span><span><i>3</i>It registers and turns Active, usually within 1–4 minutes.</span></div>
          </>
        ))}
        <Notice notice={notice} />
      </div>
      <div className="drawer-footer"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" icon={<Plus size={16} />} disabled={busy || (kind === 'aws' ? !accountId || !region : !providerName.trim() || !manualRegion)}>{busy ? 'Working…' : kind === 'aws' ? 'Create server' : 'Get install command'}</Button></div>
    </form>
  );
}

function InstallDrawer({ command, providerName, regionName, onClose, showToast }: {
  command: string; providerName: string; regionName: string; onClose: () => void; showToast: (t: string) => void;
}) {
  return (
    <div className="drawer-form">
      <DrawerHeader title="Install command" description={`${providerName} · shown in the app as ${regionName}`} onClose={onClose} badge={<ServerIcon size={17} />} />
      <div className="drawer-body">
        <div className="inline-alert inline-alert-warning"><ShieldAlert size={16} /><span>This command works once and contains a secret key. Do not share it. If you lose it, use “Show install command” on the Servers page for a new one.</span></div>
        <div className="next-steps">
          <strong>Steps</strong>
          <span><i>1</i>Log in to your VPS with SSH as root. The IP address and password are in your {providerName} account.</span>
          <span><i>2</i>Paste the command below and press Enter. It takes 1–3 minutes.</span>
          <span><i>3</i>When it prints “Veil server is set up”, this server turns Active on the Servers page.</span>
        </div>
        <code className="mono" style={{ display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-all', padding: 12, borderRadius: 9, background: '#f4f7f5', fontSize: 11 }}>{command}</code>
        <button className="button button-secondary test-keys" type="button" onClick={() => { void navigator.clipboard?.writeText(command).then(() => showToast('Command copied')); }}><Copy size={16} />Copy command</button>
      </div>
      <div className="drawer-footer"><Button variant="primary" onClick={onClose}>Done</Button></div>
    </div>
  );
}

function DeviceDrawer({ id, onClose, confirm, showToast, showError }: {
  id: string; onClose: () => void; confirm: (c: Confirm) => void; showToast: (t: string) => void; showError: (e: unknown) => void;
}) {
  const detail = useLoad<DeviceDetail>(() => api.device(id), [id]);
  const settings = useLoad(() => api.settings(), []);
  const [customMinutes, setCustomMinutes] = useState('');
  const [reason, setReason] = useState<'reward_farming' | 'abuse_report' | 'other'>('reward_farming');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const d = detail.data;

  const run = async (fn: () => Promise<DeviceDetail>, done: string) => {
    setBusy(true);
    try {
      detail.setData(await fn());
      showToast(done);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };
  const adjust = (minutes: number) => void run(() => api.adjust(id, minutes), `${minutes > 0 ? '+' : ''}${minutes} minutes applied`);

  return (
    <div className="drawer-form">
      <DrawerHeader title={shortDevice(id)} description={id} onClose={onClose} badge={<Smartphone size={17} />} />
      {detail.error && <div className="drawer-body"><LoadError error={detail.error} onRetry={() => void detail.reload()} /></div>}
      {!d && !detail.error && <div className="drawer-body"><Loading /></div>}
      {d && (
        <>
          <div className="device-status-line"><DeviceState status={d.status} session={d.session} /><button className="icon-button" title="Copy device ID" onClick={() => { void navigator.clipboard?.writeText(d.id); showToast('Device ID copied'); }}><Copy size={15} /></button></div>
          <div className="drawer-body device-drawer-body">
            <div className="device-facts">
              <Fact label="Balance" value={formatBalance(d.balanceSeconds)} /><Fact label="Ads today" value={`${d.adsToday}${settings.data ? ` of ${settings.data.maxAdsPerDay}` : ''}`} />
              <Fact label="Current region" value={d.session?.regionCode ?? '—'} /><Fact label="Protocol" value={d.session?.protocol.toUpperCase() ?? '—'} />
              <Fact label="First seen" value={formatDate(d.firstSeenAt)} /><Fact label="Last seen" value={formatAgo(d.lastSeenAt)} />
              <Fact label="App version" value={d.appVersion} /><Fact label="Installs on this phone" value={String(d.installCount)} />
            </div>
            <div className="drawer-divider" />
            <section className="drawer-control">
              <h3>Adjust minutes</h3>
              <div className="quick-adjust">{[15, 30, 60].map((m) => <Button key={m} disabled={busy} onClick={() => adjust(m)}>+{m} min</Button>)}</div>
              <form className="custom-adjust" onSubmit={(event) => { event.preventDefault(); const v = Number(customMinutes); if (Number.isInteger(v) && v !== 0 && Math.abs(v) <= 100000) { adjust(v); setCustomMinutes(''); } }}>
                <input type="number" value={customMinutes} onChange={(event) => setCustomMinutes(event.target.value)} placeholder="Custom, e.g. -10" /><Button type="submit" disabled={busy}>Apply</Button>
              </form>
            </section>
            {d.status === 'connected' && (
              <section className="drawer-control"><h3>Connection</h3><Button disabled={busy} onClick={() => void run(() => api.disconnect(id), 'Device disconnected')}>Disconnect now</Button><p>Ends the current session. The device can reconnect if it has minutes.</p></section>
            )}
            {d.status === 'blocked' ? (
              <section className="block-device-card"><h3>Device is blocked</h3><p>{d.blockedReason ? `Reason: ${d.blockedReason.replace(/_/g, ' ')}. ` : ''}{d.blockedAt ? `Since ${formatDate(d.blockedAt)}. ` : ''}The block covers every install on this phone.</p><Button disabled={busy} onClick={() => void run(() => api.unblock(id), 'Device unblocked')}>Unblock device</Button></section>
            ) : (
              <section className="block-device-card">
                <h3>Block device</h3>
                <label className="form-field">Reason (only admins see this)<select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}><option value="reward_farming">Reward farming</option><option value="abuse_report">Abuse report</option><option value="other">Other</option></select></label>
                <label className="form-field">Note (optional)<input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Up to 200 characters" /></label>
                <p>Disconnects every install on this phone immediately and stops its rewards.</p>
                <Button variant="danger" icon={<ShieldAlert size={16} />} disabled={busy} onClick={() => confirm({
                  title: 'Block this device?',
                  text: 'Every install on this phone is disconnected and can no longer connect or earn minutes. You can unblock it later.',
                  action: 'Block device',
                  danger: true,
                  onConfirm: async () => { detail.setData(await api.block(id, reason, note.trim() || undefined)); showToast('Device blocked'); },
                })}>Block device</Button>
              </section>
            )}
            <p className="privacy-drawer-note"><LockKeyhole size={14} />No browsing history or traffic logs are available.</p>
          </div>
        </>
      )}
      <div className="drawer-footer"><Button onClick={onClose}>Close</Button></div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="device-fact"><span>{label}</span><strong>{value}</strong></div>;
}

export default App;
