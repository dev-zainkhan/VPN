export type Page =
  | 'Dashboard'
  | 'AWS accounts'
  | 'Servers'
  | 'Regions'
  | 'Devices'
  | 'Rewards'
  | 'Settings';

export type ServerStatus = 'Active' | 'Provisioning' | 'Draining' | 'Failed';
export type DeviceStatus = 'Connected' | 'Offline' | 'Blocked';

export type Usage = {
  compute: number;
  computeLimit: number;
  data: number;
  dataLimit: number;
};

export type Account = {
  id: string;
  name: string;
  accessKey: string;
  status: 'Working' | 'Keys rejected' | 'Disabled';
  servers: number;
  usage: Usage;
  added: string;
};

export type Server = {
  id: string;
  city: string;
  region: string;
  account: string;
  ip: string;
  status: ServerStatus;
  devices: number;
  cpu: number | null;
  uptime: string;
  visible: boolean;
};

export type Device = {
  id: string;
  status: DeviceStatus;
  location: string;
  protocol: 'UDP' | 'TCP' | '—';
  balance: number;
  adsToday: number;
  firstSeen: string;
  lastSeen: string;
  installs: number;
};

export type Region = {
  code: string;
  name: string;
  country: string;
  activeServers: number;
  visible: boolean;
};

export const initialAccounts: Account[] = [
  {
    id: 'acct-main',
    name: 'Main',
    accessKey: 'AKIA…7Q2F',
    status: 'Working',
    servers: 3,
    usage: { compute: 466, computeLimit: 750, data: 82, dataLimit: 100 },
    added: 'Sep 2, 2026',
  },
  {
    id: 'acct-eu2',
    name: 'EU-2',
    accessKey: 'AKIA…K9MD',
    status: 'Working',
    servers: 2,
    usage: { compute: 310, computeLimit: 750, data: 37, dataLimit: 100 },
    added: 'Sep 18, 2026',
  },
  {
    id: 'acct-asia',
    name: 'Asia-1',
    accessKey: 'AKIA…3XWB',
    status: 'Working',
    servers: 1,
    usage: { compute: 138, computeLimit: 750, data: 12, dataLimit: 100 },
    added: 'Oct 1, 2026',
  },
  {
    id: 'acct-backup',
    name: 'Backup',
    accessKey: 'AKIA…P0LZ',
    status: 'Keys rejected',
    servers: 0,
    usage: { compute: 0, computeLimit: 750, data: 0, dataLimit: 100 },
    added: 'Oct 4, 2026',
  },
];

export const initialServers: Server[] = [
  { id: 'i-07c2…a14e', city: 'Frankfurt', region: 'eu-central-1', account: 'Main', ip: '3.121.48.207', status: 'Active', devices: 58, cpu: 22, uptime: '6d 4h', visible: true },
  { id: 'i-0b91…77f0', city: 'Frankfurt', region: 'eu-central-1', account: 'EU-2', ip: '18.194.10.63', status: 'Active', devices: 38, cpu: 17, uptime: '2d 11h', visible: true },
  { id: 'i-02de…c3b9', city: 'London', region: 'eu-west-2', account: 'Main', ip: '35.177.92.14', status: 'Active', devices: 41, cpu: 19, uptime: '9d 1h', visible: true },
  { id: 'i-0a3f…091c', city: 'London', region: 'eu-west-2', account: 'EU-2', ip: '—', status: 'Failed', devices: 0, cpu: null, uptime: '12m', visible: false },
  { id: 'i-0e44…5d21', city: 'Virginia', region: 'us-east-1', account: 'Main', ip: '44.201.7.180', status: 'Draining', devices: 12, cpu: 8, uptime: '12d 6h', visible: false },
  { id: 'i-09f1…e802', city: 'Mumbai', region: 'ap-south-1', account: 'Asia-1', ip: '13.233.150.9', status: 'Active', devices: 24, cpu: 9, uptime: '4d 20h', visible: true },
];

export const initialRegions: Region[] = [
  { code: 'eu-central-1', name: 'Frankfurt', country: 'Germany', activeServers: 2, visible: true },
  { code: 'eu-west-2', name: 'London', country: 'United Kingdom', activeServers: 1, visible: true },
  { code: 'eu-west-3', name: 'Paris', country: 'France', activeServers: 0, visible: true },
  { code: 'eu-west-1', name: 'Dublin', country: 'Ireland', activeServers: 0, visible: true },
  { code: 'us-east-1', name: 'Virginia', country: 'United States', activeServers: 1, visible: true },
  { code: 'ap-south-1', name: 'Mumbai', country: 'India', activeServers: 1, visible: true },
  { code: 'ap-southeast-1', name: 'Singapore', country: 'Singapore', activeServers: 1, visible: true },
  { code: 'ap-northeast-1', name: 'Tokyo', country: 'Japan', activeServers: 0, visible: false },
];

export const initialDevices: Device[] = [
  { id: '4c1e…9a07', status: 'Connected', location: 'Frankfurt', protocol: 'UDP', balance: 42, adsToday: 3, firstSeen: 'Oct 2, 2026', lastSeen: 'Now', installs: 1 },
  { id: '9e03…7b4c', status: 'Connected', location: 'London', protocol: 'TCP', balance: 65, adsToday: 8, firstSeen: 'Sep 28, 2026', lastSeen: 'Now', installs: 1 },
  { id: 'a71f…c2d8', status: 'Offline', location: '—', protocol: '—', balance: 0, adsToday: 10, firstSeen: 'Oct 9, 2026', lastSeen: '12 min ago', installs: 1 },
  { id: 'b7d2…01fe', status: 'Blocked', location: '—', protocol: '—', balance: 200, adsToday: 1, firstSeen: 'Oct 10, 2026', lastSeen: '1 h ago', installs: 4 },
  { id: '1d88…e5a2', status: 'Connected', location: 'Mumbai', protocol: 'UDP', balance: 18, adsToday: 9, firstSeen: 'Oct 6, 2026', lastSeen: 'Now', installs: 1 },
  { id: 'f2b4…3c91', status: 'Offline', location: '—', protocol: '—', balance: 130, adsToday: 8, firstSeen: 'Sep 21, 2026', lastSeen: 'Yesterday', installs: 2 },
  { id: '60ac…d417', status: 'Connected', location: 'Virginia', protocol: 'UDP', balance: 7, adsToday: 10, firstSeen: 'Oct 11, 2026', lastSeen: 'Now', installs: 4 },
  { id: 'c3e9…8f60', status: 'Offline', location: '—', protocol: '—', balance: 55, adsToday: 2, firstSeen: 'Oct 3, 2026', lastSeen: '3 days ago', installs: 1 },
];

export const dailyRewards = [
  { day: 'Sep 28', value: 612 },
  { day: '29', value: 655 },
  { day: '30', value: 700 },
  { day: 'Oct 1', value: 688 },
  { day: '2', value: 742 },
  { day: '3', value: 810 },
  { day: '4', value: 865 },
  { day: '5', value: 902 },
  { day: '6', value: 958 },
  { day: '7', value: 1011 },
  { day: '8', value: 1096 },
  { day: '9', value: 1150 },
  { day: '10', value: 1263 },
  { day: 'Today', value: 1342 },
];
