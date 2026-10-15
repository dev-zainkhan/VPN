import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Cloud,
  Copy,
  ExternalLink,
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
  dailyRewards,
  initialAccounts,
  initialDevices,
  initialRegions,
  initialServers,
  type Account,
  type Device,
  type Page,
  type Region,
  type Server,
} from './data';

type Drawer = 'account' | 'server' | 'device' | null;
type FormNotice = { tone: 'success' | 'error'; text: string } | null;
type AdminSettings = {
  minutesPerAd: string;
  starterMinutes: string;
  maxAdsPerDay: string;
  lowMinutesWarning: string;
  defaultProtocol: string;
  supportEmail: string;
  twoFactor: boolean;
};

const navGroups: { label?: string; items: { page: Page; icon: typeof LayoutDashboard; badge?: string }[] }[] = [
  { items: [{ page: 'Dashboard', icon: LayoutDashboard, badge: '3' }] },
  {
    label: 'Infrastructure',
    items: [
      { page: 'AWS accounts', icon: Cloud },
      { page: 'Servers', icon: ServerIcon, badge: '1' },
      { page: 'Regions', icon: Globe2 },
    ],
  },
  { label: 'Users', items: [{ page: 'Devices', icon: Smartphone }] },
  { items: [{ page: 'Rewards', icon: Play }] },
  { label: 'System', items: [{ page: 'Settings', icon: SlidersHorizontal }] },
];

const percent = (value: number, max: number) => Math.min(Math.round((value / max) * 100), 100);

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand-mark${small ? ' brand-mark-small' : ''}`}>
      <ShieldCheck size={small ? 18 : 21} strokeWidth={2.4} />
    </div>
  );
}

function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [page, setPage] = useState<Page>('Dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [accounts, setAccounts] = useState(initialAccounts);
  const [servers, setServers] = useState(initialServers);
  const [regions, setRegions] = useState(initialRegions);
  const [devices, setDevices] = useState(initialDevices);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [serverStatus, setServerStatus] = useState('All');
  const [serverSearch, setServerSearch] = useState('');
  const [deviceStatus, setDeviceStatus] = useState('All');
  const [deviceSearch, setDeviceSearch] = useState('');
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [notice, setNotice] = useState<FormNotice>(null);
  const [modal, setModal] = useState<{ title: string; text: string; action: string; onConfirm: () => void; danger?: boolean } | null>(null);
  const [toast, setToast] = useState('');
  const [settings, setSettings] = useState({
    minutesPerAd: '30',
    starterMinutes: '60',
    maxAdsPerDay: '10',
    lowMinutesWarning: '10',
    defaultProtocol: 'Auto',
    supportEmail: 'support@veil.example',
    twoFactor: true,
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const activeServers = servers.filter((server) => server.status === 'Active').length;
  const connectedDevices = devices.filter((device) => device.status === 'Connected').length;
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;

  const filteredDevices = useMemo(() => {
    const normalized = deviceSearch.trim().toLowerCase();
    return devices.filter((device) => {
      const matchesStatus = deviceStatus === 'All' || device.status === deviceStatus;
      const matchesQuery = !normalized || device.id.toLowerCase().includes(normalized);
      return matchesStatus && matchesQuery;
    });
  }, [devices, deviceSearch, deviceStatus]);

  const filteredServers = useMemo(
    () => servers.filter((server) => {
      const normalizedSearch = serverSearch.trim().toLowerCase();
      const matchesStatus = serverStatus === 'All' || server.status === serverStatus;
      const matchesSearch = !normalizedSearch ||
        `${server.id} ${server.city} ${server.region} ${server.ip}`.toLowerCase().includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    }),
    [servers, serverStatus, serverSearch],
  );

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  };

  const openDrawer = (kind: Drawer) => {
    setNotice(null);
    setDrawer(kind);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    window.setTimeout(() => setDrawer(null), 220);
  };

  const navigate = (nextPage: Page) => {
    setPage(nextPage);
    setSidebarOpen(false);
    setMobileMenuOpen(false);
    setGlobalSearch('');
    setMobileSearchOpen(false);
  };

  const submitGlobalSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = globalSearch.trim();
    if (!query) return;
    const matchingServer = servers.some((server) =>
      `${server.id} ${server.city} ${server.region} ${server.ip}`.toLowerCase().includes(query.toLowerCase()),
    );
    if (matchingServer) {
      setServerSearch(query);
      navigate('Servers');
    } else {
      setDeviceSearch(query);
      navigate('Devices');
    }
  };

  const updateServer = (id: string, updates: Partial<Server>) => {
    setServers((current) => current.map((server) => (server.id === id ? { ...server, ...updates } : server)));
  };

  const openConfirm = (
    title: string,
    text: string,
    action: string,
    onConfirm: () => void,
    danger = false,
  ) => setModal({ title, text, action, onConfirm, danger });

  const addAccount = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('nickname') ?? '').trim();
    const key = String(form.get('accessKey') ?? '').trim();
    const secret = String(form.get('secretKey') ?? '').trim();
    if (!name || !/^AKIA[A-Z0-9]{16}$/.test(key) || secret.length !== 40) {
      setNotice({ tone: 'error', text: 'Enter a nickname, a valid AKIA access key ID, and a 40-character secret key.' });
      return;
    }
    setAccounts((current) => [
      ...current,
      {
        id: `acct-${Date.now()}`,
        name,
        accessKey: `${key.slice(0, 4)}…${key.slice(-4)}`,
        status: 'Working',
        servers: 0,
        usage: { compute: 0, computeLimit: 750, data: 0, dataLimit: 100 },
        added: 'Just now',
      },
    ]);
    setNotice({ tone: 'success', text: 'Demo account added. Credentials are not sent or stored.' });
    showToast('AWS account added to demo');
    event.currentTarget.reset();
    closeDrawer();
  };

  const addServer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const accountName = String(form.get('account') ?? '');
    const regionCode = String(form.get('region') ?? '');
    const region = regions.find((item) => item.code === regionCode);
    if (!accountName || !region) {
      setNotice({ tone: 'error', text: 'Choose an AWS account and region.' });
      return;
    }
    setServers((current) => [
      {
        id: `i-demo…${String(current.length + 1).padStart(4, '0')}`,
        city: region.name,
        region: region.code,
        account: accountName,
        ip: '—',
        status: 'Provisioning',
        devices: 0,
        cpu: null,
        uptime: 'Just now',
        visible: false,
      },
      ...current,
    ]);
    setAccounts((current) => current.map((account) =>
      account.name === accountName ? { ...account, servers: account.servers + 1 } : account,
    ));
    setServerStatus('All');
    setNotice({ tone: 'success', text: 'Demo server added in provisioning state. No AWS instance was launched.' });
    showToast('Server added to demo');
    event.currentTarget.reset();
    closeDrawer();
  };

  const saveSettings = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    showToast('Settings saved in this demo');
  };

  if (!signedIn) {
    return (
      <LoginScreen
        onSignIn={() => {
          setSignedIn(true);
          showToast('Demo session started');
        }}
        onForgotPassword={() => showToast('Password reset will be available when the backend is connected')}
      />
    );
  }

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
              {group.items.map(({ page: itemPage, icon: Icon, badge }) => (
                <button
                  className={`nav-item${page === itemPage ? ' active' : ''}`}
                  key={itemPage}
                  onClick={() => navigate(itemPage)}
                >
                  <Icon size={18} strokeWidth={1.8} />
                  <span>{itemPage}</span>
                  {badge && <span className={`nav-badge${badge === '3' ? ' alert-badge' : ''}`}>{badge}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">A</div>
          <div className="admin-identity"><strong>Admin</strong><span>admin@veil.example</span></div>
          <button className="icon-button signout" title="Sign out" onClick={() => setSignedIn(false)}><LogOut size={17} /></button>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Admin</span><ChevronRight size={15} /><strong>{page}</strong></div>
          <button className="icon-button mobile-search-toggle" aria-label="Search devices" onClick={() => setMobileSearchOpen((current) => !current)}><Search size={17} /></button>
          <form className={`global-search${mobileSearchOpen ? ' global-search-open' : ''}`} onSubmit={submitGlobalSearch}>
            <Search size={17} />
            <input
              aria-label="Search by device ID, server or IP"
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              placeholder="Search device ID, server or IP"
            />
            <kbd>⌘ K</kbd>
          </form>
          <div className="environment"><span />Production</div>
          <span className="updated-time">Updated 14:32</span>
          <button className="icon-button refresh-button" title="Refresh overview" onClick={() => showToast('Demo data is up to date')}><RefreshCw size={17} /></button>
          <button className="icon-button notification-button" title="Notifications" onClick={() => navigate('Dashboard')}><Bell size={17} /><i /></button>
          <button className="mobile-avatar" onClick={() => setMobileMenuOpen((current) => !current)}>A</button>
        </header>

        {mobileMenuOpen && (
          <div className="mobile-profile">
            <span>Signed in as <strong>Admin</strong></span>
            <button onClick={() => setSignedIn(false)}><LogOut size={15} /> Sign out</button>
          </div>
        )}

        <div className="page-scroll">
          <div className="page-content">
            {page === 'Dashboard' && (
              <DashboardPage
                servers={servers}
                accounts={accounts}
                connectedDevices={connectedDevices}
                activeServers={activeServers}
                dismissedAlerts={dismissedAlerts}
                dismissAlert={(id) => setDismissedAlerts((current) => [...current, id])}
                onNavigate={navigate}
                onOpenServer={() => navigate('Servers')}
                onOpenAccount={() => navigate('AWS accounts')}
              />
            )}
            {page === 'AWS accounts' && (
              <AccountsPage accounts={accounts} onAdd={() => openDrawer('account')} onUpdateAccount={(id, updates) => setAccounts((current) => current.map((account) => account.id === id ? { ...account, ...updates } : account))} showToast={showToast} />
            )}
            {page === 'Servers' && (
              <ServersPage
                servers={filteredServers}
                allServers={servers}
                activeStatus={serverStatus}
                search={serverSearch}
                onSearch={setServerSearch}
                onStatusChange={setServerStatus}
                onCreate={() => openDrawer('server')}
                onUpdate={updateServer}
                onConfirm={openConfirm}
              />
            )}
            {page === 'Regions' && (
              <RegionsPage regions={regions} onChange={setRegions} showToast={showToast} />
            )}
            {page === 'Devices' && (
              <DevicesPage
                devices={filteredDevices}
                allDevices={devices}
                activeStatus={deviceStatus}
                search={deviceSearch}
                onSearch={setDeviceSearch}
                onStatusChange={setDeviceStatus}
                onOpenDevice={(id) => {
                  setSelectedDeviceId(id);
                  openDrawer('device');
                }}
              />
            )}
            {page === 'Rewards' && (
              <RewardsPage devices={devices} onReview={(id) => {
                setSelectedDeviceId(id);
                openDrawer('device');
              }} />
            )}
            {page === 'Settings' && (
              <SettingsPage settings={settings} onChange={setSettings} onSubmit={saveSettings} onToast={showToast} />
            )}
          </div>
          <footer className="page-footer"><span>Veil Admin</span><span>UI prototype · Data is simulated</span><span>Build v0.1.0</span></footer>
        </div>
      </main>

      {drawer && (
        <div className="drawer-layer">
          <button className="drawer-scrim" aria-label="Close panel" onClick={closeDrawer} />
          <aside className={`drawer${drawerOpen ? ' drawer-open' : ''}`}>
            {drawer === 'account' && <AccountDrawer onClose={closeDrawer} onSubmit={addAccount} notice={notice} onTest={() => setNotice({ tone: 'success', text: 'Demo check passed. No AWS request was made.' })} />}
            {drawer === 'server' && <ServerDrawer accounts={accounts} regions={regions} onClose={closeDrawer} onSubmit={addServer} notice={notice} />}
            {drawer === 'device' && selectedDevice && (
              <DeviceDrawer
                device={selectedDevice}
                onClose={closeDrawer}
                onAdjust={(minutes) => {
                  setDevices((current) => current.map((device) => device.id === selectedDevice.id ? { ...device, balance: Math.max(0, device.balance + minutes) } : device));
                  showToast(`${minutes > 0 ? '+' : ''}${minutes} minutes applied`);
                }}
                onDisconnect={() => {
                  setDevices((current) => current.map((device) => device.id === selectedDevice.id ? { ...device, status: 'Offline', location: '—', protocol: '—' } : device));
                  showToast('Device disconnected in demo');
                }}
                onBlock={() => {
                  setDevices((current) => current.map((device) => device.id === selectedDevice.id ? { ...device, status: 'Blocked', location: '—', protocol: '—' } : device));
                  showToast('Device blocked in demo');
                }}
                onUnblock={() => {
                  setDevices((current) => current.map((device) => device.id === selectedDevice.id ? { ...device, status: 'Offline' } : device));
                  showToast('Device unblocked in demo');
                }}
              />
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
              <button className="button button-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className={`button${modal.danger ? ' button-danger' : ' button-primary'}`} onClick={() => { modal.onConfirm(); setModal(null); }}>{modal.action}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  );
}

function LoginScreen({ onSignIn, onForgotPassword }: { onSignIn: () => void; onForgotPassword: () => void }) {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!String(data.get('email') ?? '').trim() || !String(data.get('password') ?? '').trim()) {
      setError('Enter your email and password to preview the admin console.');
      return;
    }
    onSignIn();
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
        <form className="login-form" onSubmit={submit}>
          <label>Email address<input name="email" type="email" autoComplete="username" placeholder="you@company.com" /></label>
          <label>
            <span className="label-row">Password<button className="text-button" type="button" onClick={onForgotPassword}>Forgot password?</button></span>
            <span className="password-input"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((current) => !current)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
          </label>
          <label>Authentication code <span className="optional">OPTIONAL</span><input name="totp" inputMode="numeric" maxLength={6} placeholder="6-digit code" /></label>
          {error && <div className="inline-alert inline-alert-error"><AlertTriangle size={16} />{error}</div>}
          <button className="button button-primary login-submit" type="submit">Sign in <ArrowRight size={17} /></button>
          <p className="login-lockout"><Shield size={14} /> After 5 failed attempts, sign-in is locked for 15 minutes.</p>
        </form>
        <div className="login-footer">Protected by <strong>Veil security</strong><span>•</span> UI preview</div>
      </div>
      <div className="login-side">
        <span className="side-kicker"><span /> CONTROL PLANE · LIVE</span>
        <h2>Everything running.<br /><span>Nothing overlooked.</span></h2>
        <p>One clear view of your VPN fleet, devices and rewards—with privacy built into every layer.</p>
        <div className="login-stats">
          <div><span className="stat-icon"><ServerIcon size={17} /></span><strong>6</strong><span>active servers</span></div>
          <div><span className="stat-icon"><Globe2 size={17} /></span><strong>5</strong><span>regions online</span></div>
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

function MetricCard({ label, value, note, icon: Icon, trend, accent = false }: {
  label: string; value: string; note: string; icon: typeof Activity; trend?: 'up' | 'down'; accent?: boolean;
}) {
  return (
    <div className={`metric-card${accent ? ' metric-accent' : ''}`}>
      <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17} /></span></div>
      <strong className="metric-value">{value}</strong>
      <div className="metric-note">{trend && (trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />)}{note}</div>
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

function DashboardPage({
  servers, accounts, connectedDevices, activeServers, dismissedAlerts, dismissAlert, onNavigate, onOpenServer, onOpenAccount,
}: {
  servers: Server[]; accounts: Account[]; connectedDevices: number; activeServers: number; dismissedAlerts: string[];
  dismissAlert: (id: string) => void; onNavigate: (page: Page) => void; onOpenServer: () => void; onOpenAccount: () => void;
}) {
  const alerts = [
    { id: 'server', type: 'error', icon: ServerIcon, title: 'Server never registered', text: 'i-0a3f…091c in London (eu-west-2) has been provisioning for 12 minutes.', cta: 'View server', action: onOpenServer },
    { id: 'keys', type: 'error', icon: KeyRound, title: 'AWS keys rejected', text: 'Account “Backup” can no longer connect to AWS. Its keys may have been deleted or rotated.', cta: 'Update keys', action: onOpenAccount },
    { id: 'usage', type: 'warning', icon: Activity, title: 'Free data limit at 82%', text: 'Account “Main” has used 82 of 100 GB of free data transfer this month.', cta: 'View usage', action: () => onNavigate('AWS accounts') },
  ].filter((alert) => !dismissedAlerts.includes(alert.id));

  return (
    <>
      <PageHeading eyebrow="OVERVIEW" title="Dashboard" description="Live overview of your VPN fleet. Numbers refresh every 60 seconds." />
      {alerts.length > 0 && (
        <section className="attention-card card">
          <div className="attention-heading"><div><h2>Needs attention</h2><span className="count-badge">{alerts.length}</span></div><span className="muted-text">Resolve issues to keep your fleet healthy</span></div>
          {alerts.map(({ id, type, icon: Icon, title, text, cta, action }) => (
            <div className="alert-row" key={id}>
              <span className={`alert-icon ${type}`}><Icon size={18} /></span>
              <div className="alert-copy"><strong>{title}</strong><span>{text}</span></div>
              <button className="button button-secondary alert-cta" onClick={action}>{cta}</button>
              <button className="icon-button alert-dismiss" aria-label={`Dismiss ${title}`} onClick={() => dismissAlert(id)}><X size={16} /></button>
            </div>
          ))}
        </section>
      )}

      <div className="metric-grid">
        <MetricCard label="Active servers" value={String(activeServers)} note="Across 5 regions" icon={ServerIcon} />
        <MetricCard label="Online now" value={String(214 + connectedDevices - 4)} note="+18 vs this time yesterday" icon={Activity} trend="up" />
        <MetricCard label="New devices today" value="87" note="+12% vs yesterday" icon={Smartphone} trend="up" />
        <MetricCard label="Ads watched today" value="1,342" note="+7% vs yesterday" icon={Play} trend="up" />
        <MetricCard label="Minutes granted" value="40,260" note="From verified ads" icon={Clock3} accent />
      </div>

      <div className="dashboard-grid">
        <section className="card usage-card">
          <div className="card-header">
            <div><h2>Free-tier usage this month</h2><p>Warning at 80% of each limit</p></div>
            <button className="inline-link" onClick={() => onNavigate('AWS accounts')}>View accounts <ArrowRight size={15} /></button>
          </div>
          <div className="usage-columns"><span>Account</span><span>Compute hours</span><span>Data out</span></div>
          {accounts.slice(0, 3).map((account) => (
            <div className="usage-row" key={account.id}>
              <strong>{account.name}</strong>
              <div className="usage-meter">
                <div className="usage-value"><span>{account.usage.compute} / {account.usage.computeLimit} h</span><span>{percent(account.usage.compute, account.usage.computeLimit)}%</span></div>
                <ProgressBar value={account.usage.compute} max={account.usage.computeLimit} />
              </div>
              <div className="usage-meter">
                <div className={`usage-value${percent(account.usage.data, account.usage.dataLimit) >= 80 ? ' usage-warning' : ''}`}><span>{account.usage.data} / {account.usage.dataLimit} GB</span><span>{percent(account.usage.data, account.usage.dataLimit)}%</span></div>
                <ProgressBar value={account.usage.data} max={account.usage.dataLimit} />
              </div>
            </div>
          ))}
          <div className="usage-footnote"><span><i className="legend-green" />Within free-tier limits</span><span><i className="legend-amber" />80%+ warning</span></div>
        </section>

        <section className="card regions-card">
          <div className="card-header"><div><h2>Servers by region</h2><p>Current fleet distribution</p></div><button className="inline-link" onClick={() => onNavigate('Servers')}>View servers <ArrowRight size={15} /></button></div>
          <div className="region-chart">
            {[
              { code: 'DE', name: 'Frankfurt', total: 2, online: 96, width: 92 },
              { code: 'GB', name: 'London', total: 1, online: 41, width: 58 },
              { code: 'US', name: 'Virginia', total: 1, online: 38, width: 54 },
              { code: 'IN', name: 'Mumbai', total: 1, online: 24, width: 36 },
              { code: 'SG', name: 'Singapore', total: 1, online: 15, width: 25 },
            ].map((region) => (
              <button className="region-bar-row" key={region.code} onClick={() => onNavigate('Servers')}>
                <span className="region-flag">{region.code}</span><span className="region-name">{region.name}</span>
                <span className="region-bar"><i style={{ width: `${region.width}%` }} /></span>
                <span className="region-total">{region.total}</span><span className="region-online">{region.online} <small>online</small></span>
              </button>
            ))}
          </div>
          <div className="regions-total"><Globe2 size={15} />5 regions with active infrastructure</div>
        </section>
      </div>
      <section className="fleet-strip">
        <span className="fleet-strip-icon"><ShieldCheck size={18} /></span>
        <div><strong>Privacy-first infrastructure</strong><span>Connection activity is never logged. Only live device and fleet status is shown.</span></div>
        <button className="inline-link" onClick={() => onNavigate('Devices')}>View devices <ArrowRight size={15} /></button>
      </section>
      <span className="screen-reader-only">{servers.length} total servers</span>
    </>
  );
}

function AccountUsageCell({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="account-usage-cell"><div><span>{value} of {max} {label}</span><span>{percent(value, max)}%</span></div><ProgressBar value={value} max={max} /></div>
  );
}

function AccountsPage({ accounts, onAdd, onUpdateAccount, showToast }: {
  accounts: Account[]; onAdd: () => void; onUpdateAccount: (id: string, updates: Partial<Account>) => void; showToast: (text: string) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  return (
    <>
      <PageHeading title="AWS accounts" description="The AWS accounts your servers run in. Keys are encrypted before they're stored." action={<Button variant="primary" icon={<Plus size={17} />} onClick={onAdd}>Add AWS account</Button>} />
      <div className="info-banner"><span className="info-banner-icon"><Shield size={17} /></span><span>Use an IAM user that can only manage EC2, never root keys. Keep each account standalone: accounts linked in AWS Organizations share one free tier.</span><button className="info-learn" onClick={() => showToast('See the backend specification for the EC2-only IAM policy.')}>Learn more <ExternalLink size={13} /></button></div>
      <section className="card table-card">
        <div className="table-scroll">
          <table className="admin-table accounts-table">
            <thead><tr><th>Account</th><th>Access key</th><th>Status</th><th className="align-center">Servers</th><th>Compute this month</th><th>Data out this month</th><th aria-label="Actions" /></tr></thead>
            <tbody>{accounts.map((account) => (
              <tr key={account.id}>
                <td><div className="table-primary">{account.name}</div><div className="table-secondary">Added {account.added}</div></td>
                <td><code className="mono">{account.accessKey}</code></td>
                <td><StatusPill tone={account.status === 'Working' ? 'green' : account.status === 'Disabled' ? 'gray' : 'red'}>{account.status}</StatusPill></td>
                <td className="align-center">{account.servers}</td>
                <td><AccountUsageCell label="h" value={account.usage.compute} max={account.usage.computeLimit} /></td>
                <td><AccountUsageCell label="GB" value={account.usage.data} max={account.usage.dataLimit} /></td>
                <td className="actions-cell">
                  <button className="icon-button table-menu-button" aria-label={`Actions for ${account.name}`} onClick={() => setMenu(menu === account.id ? null : account.id)}><MoreHorizontal size={18} /></button>
                  {menu === account.id && <div className="row-menu"><button onClick={() => { onUpdateAccount(account.id, { status: 'Working' }); setMenu(null); showToast('Account check simulated'); }}>Test account</button><button onClick={() => { onUpdateAccount(account.id, { status: 'Working' }); setMenu(null); showToast('Key update available in the backend-connected version'); }}>Update keys</button><button onClick={() => { onUpdateAccount(account.id, { status: account.status === 'Disabled' ? 'Working' : 'Disabled' }); setMenu(null); }}> {account.status === 'Disabled' ? 'Enable account' : 'Disable account'}</button></div>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="table-footer"><span>{accounts.length} accounts</span><span>Usage resets monthly · updated just now</span></div>
      </section>
      <p className="page-note"><LockKeyhole size={14} />Access keys are sensitive. This preview never transmits or persists credentials.</p>
    </>
  );
}

function TabBar({ tabs, active, onChange }: { tabs: { label: string; count?: number }[]; active: string; onChange: (label: string) => void }) {
  return <div className="tabs" role="tablist">{tabs.map((tab) => <button role="tab" aria-selected={active === tab.label} className={`tab${active === tab.label ? ' active' : ''}`} key={tab.label} onClick={() => onChange(tab.label)}>{tab.label}{tab.count !== undefined && <span>{tab.count}</span>}</button>)}</div>;
}

function ServersPage({ servers, allServers, activeStatus, search, onSearch, onStatusChange, onCreate, onUpdate, onConfirm }: {
  servers: Server[]; allServers: Server[]; activeStatus: string; search: string; onSearch: (value: string) => void; onStatusChange: (status: string) => void; onCreate: () => void;
  onUpdate: (id: string, updates: Partial<Server>) => void;
  onConfirm: (title: string, text: string, action: string, onConfirm: () => void, danger?: boolean) => void;
}) {
  const counts = ['All', 'Active', 'Provisioning', 'Draining', 'Failed'].map((label) => ({
    label,
    count: label === 'All' ? allServers.length : allServers.filter((server) => server.status === label).length,
  }));
  const [accountFilter, setAccountFilter] = useState('All accounts');
  const [regionFilter, setRegionFilter] = useState('All regions');
  const [menu, setMenu] = useState<string | null>(null);
  const visibleServers = servers.filter((server) =>
    (accountFilter === 'All accounts' || server.account === accountFilter) &&
    (regionFilter === 'All regions' || server.region === regionFilter),
  );

  const doAction = (server: Server, action: 'Reboot' | 'Drain' | 'Undrain' | 'Terminate') => {
    const danger = action === 'Terminate';
    onConfirm(
      `${action} ${server.city} server?`,
      action === 'Terminate'
        ? `${server.devices} connected devices may be moved to another server or disconnected. This demo will only update the displayed server state.`
        : `${server.id} · ${server.region}. This demo changes only the displayed server state.`,
      action,
      () => {
        onUpdate(
          server.id,
          action === 'Drain'
            ? { status: 'Draining', visible: false }
            : action === 'Undrain'
              ? { status: 'Active' }
              : action === 'Terminate'
                ? { status: 'Failed', visible: false, devices: 0 }
                : { status: 'Provisioning', visible: false },
        );
      },
      danger,
    );
  };

  return (
    <>
      <PageHeading title="Servers" description="Every VPN server across your AWS accounts." action={<Button variant="primary" icon={<Plus size={17} />} onClick={onCreate}>Create server</Button>} />
      <section className="card table-card">
        <div className="table-toolbar">
          <TabBar tabs={counts} active={activeStatus} onChange={onStatusChange} />
          <div className="filter-group">
            <label className="table-search server-search"><Search size={14} /><input aria-label="Search servers" placeholder="Search server, region, IP" value={search} onChange={(event) => onSearch(event.target.value)} />{search && <button aria-label="Clear server search" onClick={() => onSearch('')}><X size={14} /></button>}</label>
            <label className="select-wrap"><Filter size={14} /><select aria-label="Filter by account" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}><option>All accounts</option>{Array.from(new Set(allServers.map((server) => server.account))).map((name) => <option key={name}>{name}</option>)}</select><ChevronDown size={14} /></label>
            <label className="select-wrap"><select aria-label="Filter by region" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option>All regions</option>{Array.from(new Set(allServers.map((server) => server.region))).map((region) => <option key={region}>{region}</option>)}</select><ChevronDown size={14} /></label>
          </div>
        </div>
        <div className="table-scroll">
          <table className="admin-table servers-table">
            <thead><tr><th>Server</th><th>Account</th><th>Public IP</th><th>Status</th><th className="align-right">Devices</th><th className="align-right">CPU</th><th className="align-right">Uptime</th><th>In app</th><th aria-label="Actions" /></tr></thead>
            <tbody>{visibleServers.map((server) => (
              <tr key={server.id}>
                <td><div className="table-primary">{server.city}</div><div className="table-secondary mono">{server.id} · {server.region}</div></td>
                <td>{server.account}</td><td className="mono">{server.ip}</td>
                <td><StatusPill tone={server.status === 'Active' ? 'green' : server.status === 'Failed' ? 'red' : server.status === 'Provisioning' ? 'amber' : 'blue'}>{server.status}</StatusPill></td>
                <td className="align-right">{server.devices}</td><td className="align-right">{server.cpu === null ? '—' : `${server.cpu}%`}</td><td className="align-right">{server.uptime}</td>
                <td><Toggle checked={server.visible} label={`Show ${server.city} in the app`} onChange={(visible) => onUpdate(server.id, { visible })} disabled={server.status !== 'Active'} /></td>
                <td className="actions-cell">
                  <button className="icon-button table-menu-button" aria-label={`Actions for ${server.id}`} onClick={() => setMenu(menu === server.id ? null : server.id)}><MoreHorizontal size={18} /></button>
                  {menu === server.id && <div className="row-menu"><button onClick={() => { doAction(server, server.status === 'Draining' ? 'Undrain' : 'Reboot'); setMenu(null); }}>{server.status === 'Draining' ? 'Undrain server' : 'Reboot server'}</button>{server.status === 'Active' && <button onClick={() => { doAction(server, 'Drain'); setMenu(null); }}>Drain server</button>}<button className="menu-danger" onClick={() => { doAction(server, 'Terminate'); setMenu(null); }}>Terminate server</button></div>}
                </td>
              </tr>
            ))}</tbody>
          </table>
          {visibleServers.length === 0 && <EmptyState icon={<ServerIcon size={23} />} title="No servers found" description="Change the filters or create a server to get started." />}
        </div>
        <div className="table-footer"><span>{visibleServers.length} of {allServers.length} servers</span><div className="pagination"><button disabled><ChevronLeft size={15} />Previous</button><span>Page 1 of 1</span><button disabled>Next<ChevronRight size={15} /></button></div></div>
      </section>
      <p className="page-note"><ShieldAlert size={14} />Terminating a live server affects connected users. Drain first to move sessions gracefully.</p>
    </>
  );
}

function Toggle({ checked, label, onChange, disabled = false }: { checked: boolean; label: string; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <button aria-label={label} aria-pressed={checked} disabled={disabled} className={`toggle${checked ? ' checked' : ''}`} onClick={() => onChange(!checked)}><i /></button>;
}

function RegionsPage({ regions, onChange, showToast }: { regions: Region[]; onChange: (regions: Region[]) => void; showToast: (text: string) => void }) {
  const [draft, setDraft] = useState(regions);
  const [saved, setSaved] = useState(true);
  const changeRegion = (code: string, updates: Partial<Region>) => {
    setDraft((current) => current.map((region) => region.code === code ? { ...region, ...updates } : region));
    setSaved(false);
  };
  const save = () => {
    onChange(draft);
    setSaved(true);
    showToast('Region settings saved in this demo');
  };
  return (
    <>
      <PageHeading title="Regions" description="Choose which locations appear in the app and how they're named. Hiding a region keeps its servers running." action={<Button variant="primary" icon={<Check size={16} />} onClick={save} disabled={saved}>Save changes</Button>} />
      {!saved && <div className="inline-alert inline-alert-warning"><AlertTriangle size={16} />You have unsaved region changes.</div>}
      <section className="card table-card">
        <div className="table-scroll">
          <table className="admin-table regions-table">
            <thead><tr><th>Name in app</th><th>AWS region</th><th className="align-center">Active servers</th><th>Visible to users</th><th>Shown in app</th></tr></thead>
            <tbody>{draft.map((region) => {
              const isVisible = region.visible && region.activeServers > 0;
              return (
                <tr key={region.code}>
                  <td><div className="region-name-input"><span className="region-flag">{region.code.split('-')[0].toUpperCase()}</span><input aria-label={`Display name for ${region.code}`} value={`${region.name}, ${region.country}`} onChange={(event) => { const [name, country] = event.target.value.split(',').map((part) => part.trim()); changeRegion(region.code, { name: name || region.name, country: country ?? region.country }); }} /></div></td>
                  <td className="mono">{region.code}</td><td className="align-center">{region.activeServers}</td>
                  <td>{isVisible ? <span className="visibility-yes"><CheckCircle2 size={15} />Yes</span> : <span className="muted-text">{region.visible ? 'No, no active servers' : 'No, hidden'}</span>}</td>
                  <td><Toggle checked={region.visible} label={`Show ${region.name} in the app`} onChange={(visible) => changeRegion(region.code, { visible })} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <div className="table-footer"><span>A region only appears in the app when it's shown and has at least one active server.</span><span>8 regions</span></div>
      </section>
    </>
  );
}

function formatMinutes(minutes: number) {
  if (minutes === 0) return '0 min';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${String(remainder).padStart(2, '0')}m` : `${minutes} min`;
}

function DevicesPage({ devices, allDevices, activeStatus, search, onSearch, onStatusChange, onOpenDevice }: {
  devices: Device[]; allDevices: Device[]; activeStatus: string; search: string; onSearch: (value: string) => void;
  onStatusChange: (status: string) => void; onOpenDevice: (id: string) => void;
}) {
  const tabCounts = [
    { label: 'All', count: 12408 },
    { label: 'Connected', count: 214 },
    { label: 'Offline', count: 12173 },
    { label: 'Blocked', count: 21 },
  ];
  return (
    <>
      <PageHeading title="Devices" description="Shows each device's current state only. Connection history and traffic are never stored." />
      <section className="card table-card">
        <div className="table-toolbar device-toolbar">
          <TabBar tabs={tabCounts} active={activeStatus} onChange={onStatusChange} />
          <label className="table-search"><Search size={15} /><input aria-label="Search by device ID" placeholder="Search by device ID" value={search} onChange={(event) => onSearch(event.target.value)} />{search && <button aria-label="Clear search" onClick={() => onSearch('')}><X size={15} /></button>}</label>
        </div>
        <div className="table-scroll">
          <table className="admin-table devices-table">
            <thead><tr><th>Device ID</th><th>Status</th><th className="align-right">Balance</th><th>First seen</th><th>Last seen</th><th aria-label="Open details" /></tr></thead>
            <tbody>{devices.map((device) => (
              <tr className="clickable-row" key={device.id} onClick={() => onOpenDevice(device.id)}>
                <td className="mono table-primary">{device.id}</td>
                <td><DeviceState device={device} /></td>
                <td className={`align-right${device.balance === 0 ? ' balance-zero' : ''}`}>{formatMinutes(device.balance)}</td>
                <td>{device.firstSeen}</td><td>{device.lastSeen}</td>
                <td><button className="icon-button open-device-button" aria-label={`View device ${device.id}`}><ChevronRight size={17} /></button></td>
              </tr>
            ))}</tbody>
          </table>
          {devices.length === 0 && <EmptyState icon={<Smartphone size={23} />} title="No devices match" description="Try another device ID or status filter." />}
        </div>
        <div className="table-footer"><span>{search ? `${devices.length} matching devices` : `1–${Math.min(allDevices.length, 50)} of 12,408 devices`}</span><div className="pagination"><button disabled><ChevronLeft size={15} />Previous</button><span>Page 1 of 249</span><button disabled={devices.length === 0}>Next<ChevronRight size={15} /></button></div></div>
      </section>
      <p className="page-note"><LockKeyhole size={14} />No websites, browsing activity, or traffic history is collected.</p>
    </>
  );
}

function DeviceState({ device }: { device: Device }) {
  if (device.status === 'Connected') return <StatusPill tone="green">Connected · {device.location} · {device.protocol}</StatusPill>;
  return <StatusPill tone={device.status === 'Blocked' ? 'red' : 'gray'}>{device.status}</StatusPill>;
}

function RewardsPage({ devices, onReview }: { devices: Device[]; onReview: (id: string) => void }) {
  const [days, setDays] = useState('14 days');
  const max = Math.max(...dailyRewards.map((day) => day.value));
  const suspiciousDevices = devices.filter((device) => device.adsToday >= 8).sort((a, b) => b.adsToday - a.adsToday);
  return (
    <>
      <PageHeading title="Rewards" description="Minutes are granted only after AdMob's server confirms the ad was watched." action={<span className="verified-label"><ShieldCheck size={15} />Server-side verified</span>} />
      <div className="metric-grid rewards-metrics">
        <MetricCard label="Ads watched today" value="1,342" note="+7% vs yesterday" icon={Play} trend="up" />
        <MetricCard label="Minutes granted today" value="40,260" note="30 minutes per ad" icon={Clock3} accent />
        <MetricCard label="Devices that watched" value="388" note="3.5 ads per device on average" icon={Smartphone} />
        <MetricCard label="Rejected today" value="57" note="No minutes granted" icon={ShieldAlert} />
      </div>
      <section className="card chart-card">
        <div className="card-header"><div><h2>Verified ads per day</h2><p>Daily totals only · no individual activity history</p></div><div className="chart-controls"><span className="chart-average">Avg <strong>914</strong> / day</span><label className="select-wrap"><select value={days} onChange={(event) => setDays(event.target.value)} aria-label="Select chart range"><option>14 days</option><option>7 days</option></select><ChevronDown size={14} /></label></div></div>
        <div className="bar-chart" role="img" aria-label="Bar chart of verified ads over the last 14 days">
          <div className="chart-gridline gridline-one"><span>1.5k</span></div><div className="chart-gridline gridline-two"><span>1.0k</span></div><div className="chart-gridline gridline-three"><span>500</span></div>
          {dailyRewards.slice(days === '7 days' ? 7 : 0).map((item, index, data) => (
            <div className="chart-bar-column" key={item.day}>
              <span className="chart-bar-value">{item.value.toLocaleString()}</span><i className={index === data.length - 1 ? 'today-bar' : ''} style={{ height: `${Math.max((item.value / max) * 78, 7)}%` }} /><span className="chart-bar-label">{item.day}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="dashboard-grid rewards-bottom">
        <section className="card rejects-card">
          <div className="card-header"><div><h2>Rejected callbacks today</h2><p>None of these granted minutes.</p></div></div>
          {[
            { title: 'Duplicate transaction', detail: 'The same ad callback was replayed', count: '41', tone: 'amber' },
            { title: 'Invalid signature', detail: 'Not signed by AdMob', count: '9', tone: 'red' },
            { title: 'Over daily limit', detail: 'Device had already watched 10 ads', count: '7', tone: 'gray' },
          ].map((row) => <div className="reject-row" key={row.title}><div><strong>{row.title}</strong><span>{row.detail}</span></div><span className={`count-badge ${row.tone}`}>{row.count}</span></div>)}
        </section>
        <section className="card suspicious-card">
          <div className="card-header"><div><h2>Most ads today</h2><p>Many reinstalls with maximum ads can indicate reward farming.</p></div><span className="muted-text">Daily limit is 10</span></div>
          <div className="table-scroll"><table className="admin-table">
            <thead><tr><th>Device ID</th><th className="align-right">Ads today</th><th className="align-right">Reinstalls</th><th /></tr></thead>
            <tbody>{suspiciousDevices.slice(0, 5).map((device) => <tr key={device.id}><td className="mono">{device.id}</td><td className="align-right">{device.adsToday}</td><td className={`align-right${device.installs > 2 ? ' text-danger' : ''}`}>{device.installs}</td><td><button className="inline-link" onClick={() => onReview(device.id)}>Review <ArrowRight size={14} /></button></td></tr>)}</tbody>
          </table></div>
        </section>
      </div>
    </>
  );
}

function SettingsPage({ settings, onChange, onSubmit, onToast }: {
  settings: AdminSettings;
  onChange: (settings: AdminSettings) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onToast: (text: string) => void;
}) {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const setField = (key: keyof typeof settings, value: string | boolean) => onChange({ ...settings, [key]: value });
  return (
    <>
      <PageHeading title="Settings" description="Changes reach every device the next time its app refreshes." action={<span className="settings-apply-note"><i />Applied to app defaults</span>} />
      <form className="settings-form" onSubmit={onSubmit}>
        <SettingsSection title="Minutes and rewards" description="How users earn and spend VPN time.">
          <div className="settings-grid">
            <NumberField label="Minutes per ad" suffix="min" help="Credited after AdMob confirms the ad." value={settings.minutesPerAd} min="1" max="240" onChange={(value) => setField('minutesPerAd', value)} />
            <NumberField label="Starter minutes" suffix="min" help="Given once to every new device." value={settings.starterMinutes} min="0" max="1440" onChange={(value) => setField('starterMinutes', value)} />
            <NumberField label="Ads per device per day" suffix="ads" help="Caps how much free time one device can earn." value={settings.maxAdsPerDay} min="1" max="100" onChange={(value) => setField('maxAdsPerDay', value)} />
            <NumberField label="Low-minutes warning" suffix="min" help="When the app shows its warning banner." value={settings.lowMinutesWarning} min="1" max="120" onChange={(value) => setField('lowMinutesWarning', value)} />
          </div>
        </SettingsSection>
        <SettingsSection title="App defaults" description="What new devices start with.">
          <div className="settings-fields">
            <label className="form-field settings-narrow">Default protocol<select value={settings.defaultProtocol} onChange={(event) => setField('defaultProtocol', event.target.value)}><option>Auto</option><option>UDP</option><option>TCP</option></select><span>Auto uses UDP and switches to TCP when a network blocks UDP.</span></label>
            <label className="form-field settings-narrow">Support email<input type="email" value={settings.supportEmail} onChange={(event) => setField('supportEmail', event.target.value)} placeholder="support@example.com" /><span>Shown on the app's blocked and help screens.</span></label>
          </div>
        </SettingsSection>
        <SettingsSection title="Security" description="Protect the account that controls your AWS keys.">
          <div className="security-card">
            <div className="security-row"><div className="security-icon"><LockKeyhole size={18} /></div><div className="security-copy"><strong>Two-factor authentication</strong><span>{settings.twoFactor ? 'On. An authenticator code is required at sign-in.' : 'Off. Enable this to add a second sign-in step.'}</span></div><Toggle checked={settings.twoFactor} label="Toggle two-factor authentication" onChange={(value) => { setField('twoFactor', value); onToast(value ? '2FA setup will be available when the backend is connected' : '2FA disabled in this demo'); }} /></div>
            <div className="security-row"><div className="security-icon"><KeyRound size={18} /></div><div className="security-copy"><strong>Password</strong><span>Last changed 21 days ago</span></div><Button onClick={() => setShowPasswordForm((current) => !current)}>{showPasswordForm ? 'Cancel' : 'Change password'}</Button></div>
            {showPasswordForm && <div className="password-change"><label className="form-field">Current password<input type="password" placeholder="Current password" /></label><label className="form-field">New password<input type="password" placeholder="At least 12 characters" /></label><Button variant="primary" onClick={() => { setShowPasswordForm(false); onToast('Password change requires a connected backend'); }}>Update password</Button></div>}
          </div>
        </SettingsSection>
        <div className="settings-submit"><span>Changes are saved for the next app refresh.</span><Button type="submit" variant="primary" icon={savedIcon()}>Save settings</Button></div>
      </form>
    </>
  );
}

function savedIcon() { return <Check size={16} />; }

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

function AccountDrawer({ onClose, onSubmit, notice, onTest }: { onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; notice: FormNotice; onTest: () => void }) {
  return (
    <form className="drawer-form" onSubmit={onSubmit}>
      <DrawerHeader title="Add AWS account" description="Use an EC2-only IAM user. Credentials are not sent in this preview." onClose={onClose} badge={<Cloud size={17} />} />
      <div className="drawer-body">
        <div className="inline-alert inline-alert-warning"><ShieldAlert size={16} /><span>Never use root account keys. AWS Organizations accounts share a free tier.</span></div>
        <DrawerField label="Nickname" help="Only you see this. Choose a name you'll recognize."><input name="nickname" placeholder="e.g. EU-3" maxLength={40} /></DrawerField>
        <DrawerField label="Access key ID" help="Long-term IAM access key beginning with AKIA."><input name="accessKey" placeholder="AKIA…" autoComplete="off" /></DrawerField>
        <DrawerField label="Secret access key" help="AWS shows the secret only once, when you create the key."><input name="secretKey" type="password" placeholder="Paste secret access key" autoComplete="new-password" /></DrawerField>
        <button className="button button-secondary test-keys" type="button" onClick={onTest}><Activity size={16} />Test credentials</button>
        {notice && <Notice notice={notice} />}
        <div className="drawer-info-list"><span><CheckCircle2 size={16} />EC2 launch and terminate access</span><span><CheckCircle2 size={16} />Free-tier eligibility checked</span><span><LockKeyhole size={16} />Encrypted by the backend when connected</span></div>
      </div>
      <div className="drawer-footer"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" icon={<Plus size={16} />}>Save account</Button></div>
    </form>
  );
}

function Notice({ notice }: { notice: FormNotice }) {
  if (!notice) return null;
  return <div className={`inline-alert inline-alert-${notice.tone === 'success' ? 'success' : 'error'}`}>{notice.tone === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{notice.text}</div>;
}

function ServerDrawer({ accounts, regions, onClose, onSubmit, notice }: { accounts: Account[]; regions: Region[]; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; notice: FormNotice }) {
  const usableAccounts = accounts.filter((account) => account.status === 'Working');
  return (
    <form className="drawer-form" onSubmit={onSubmit}>
      <DrawerHeader title="Create server" description="Add a server to the VPN fleet." onClose={onClose} badge={<ServerIcon size={17} />} />
      <div className="drawer-body">
        {usableAccounts.length === 0 ? <div className="inline-alert inline-alert-error"><AlertTriangle size={16} />Add a working AWS account before creating a server.</div> : (
          <>
            <DrawerField label="AWS account"><select name="account" defaultValue={usableAccounts[0]?.name}>{usableAccounts.map((account) => <option key={account.id}>{account.name}</option>)}</select><span>440 free compute hours left this month in the selected account.</span></DrawerField>
            <DrawerField label="Region"><select name="region" defaultValue={regions[0]?.code}>{regions.map((region) => <option value={region.code} key={region.code}>{region.name} ({region.code})</option>)}</select></DrawerField>
            <fieldset className="instance-options"><legend>Instance type</legend><label><input type="radio" name="instanceType" value="t3.micro" defaultChecked /><span><strong>t3.micro</strong><small>2 vCPU, 1 GB memory · Recommended</small></span><em>Free tier</em></label><label><input type="radio" name="instanceType" value="t2.micro" /><span><strong>t2.micro</strong><small>1 vCPU, 1 GB memory · For regions without t3</small></span><em>Free tier</em></label></fieldset>
            <div className="next-steps"><strong>What happens next</strong><span><i>1</i>The instance launches with only UDP 51820 and TCP 443 open.</span><span><i>2</i>On first boot it installs WireGuard and the Veil agent.</span><span><i>3</i>It registers and turns Active, usually within 2 minutes.</span></div>
          </>
        )}
        {notice && <Notice notice={notice} />}
      </div>
      <div className="drawer-footer"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" icon={<Plus size={16} />} disabled={usableAccounts.length === 0}>Create server</Button></div>
    </form>
  );
}

function DeviceDrawer({ device, onClose, onAdjust, onDisconnect, onBlock, onUnblock }: {
  device: Device; onClose: () => void; onAdjust: (minutes: number) => void; onDisconnect: () => void; onBlock: () => void; onUnblock: () => void;
}) {
  const [customMinutes, setCustomMinutes] = useState('');
  const [reason, setReason] = useState('Reward farming');
  return (
    <div className="drawer-form">
      <DrawerHeader title={device.id} onClose={onClose} badge={<Smartphone size={17} />} />
      <div className="device-status-line"><DeviceState device={device} /><button className="icon-button" title="Copy device ID" onClick={() => { void navigator.clipboard?.writeText(device.id); }}><Copy size={15} /></button></div>
      <div className="drawer-body device-drawer-body">
        <div className="device-facts">
          <Fact label="Balance" value={formatMinutes(device.balance)} /><Fact label="Ads today" value={`${device.adsToday} of 10`} />
          <Fact label="Current server" value={device.status === 'Connected' ? device.location : '—'} /><Fact label="Protocol" value={device.protocol} />
          <Fact label="First seen" value={device.firstSeen} /><Fact label="Last seen" value={device.lastSeen} />
          <Fact label="App version" value="1.0.0" /><Fact label="Reinstalls" value={String(device.installs)} />
        </div>
        <div className="drawer-divider" />
        <section className="drawer-control"><h3>Adjust minutes</h3><div className="quick-adjust">{[15, 30, 60].map((minutes) => <Button key={minutes} onClick={() => onAdjust(minutes)}>+{minutes} min</Button>)}</div><form className="custom-adjust" onSubmit={(event) => { event.preventDefault(); const value = Number(customMinutes); if (Number.isInteger(value) && value !== 0) { onAdjust(value); setCustomMinutes(''); } }}><input type="number" value={customMinutes} onChange={(event) => setCustomMinutes(event.target.value)} placeholder="Custom, e.g. -10" /><Button type="submit">Apply</Button></form></section>
        {device.status === 'Connected' && <section className="drawer-control"><h3>Connection</h3><Button onClick={onDisconnect}>Disconnect now</Button><p>Ends the current session. The device can reconnect if it has minutes.</p></section>}
        {device.status === 'Blocked' ? <section className="block-device-card"><h3>Device is blocked</h3><p>This device cannot connect. The block applies after a reinstall.</p><Button onClick={onUnblock}>Unblock device</Button></section> : (
          <section className="block-device-card"><h3>Block device</h3><label className="form-field">Reason (only admins see this)<select value={reason} onChange={(event) => setReason(event.target.value)}><option>Reward farming</option><option>Abuse report</option><option>Other</option></select></label><p>Disconnects the device immediately and stops its rewards.</p><Button variant="danger" icon={<ShieldAlert size={16} />} onClick={onBlock}>Block device</Button></section>
        )}
        <p className="privacy-drawer-note"><LockKeyhole size={14} />No browsing history or traffic logs are available.</p>
      </div>
      <div className="drawer-footer"><Button onClick={onClose}>Close</Button></div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="device-fact"><span>{label}</span><strong>{value}</strong></div>;
}

export default App;
