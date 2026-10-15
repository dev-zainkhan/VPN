export type Location = {
  code: string;
  country: string;
  city: string;
  ping: number;
};

export type Protocol = 'Auto' | 'UDP' | 'TCP';

export const locations: Location[] = [
  { code: 'DE', country: 'Germany', city: 'Frankfurt', ping: 38 },
  { code: 'FR', country: 'France', city: 'Paris', ping: 41 },
  { code: 'GB', country: 'United Kingdom', city: 'London', ping: 44 },
  { code: 'IE', country: 'Ireland', city: 'Dublin', ping: 47 },
  { code: 'US', country: 'United States', city: 'Virginia', ping: 96 },
  { code: 'IN', country: 'India', city: 'Mumbai', ping: 142 },
  { code: 'SG', country: 'Singapore', city: 'Singapore', ping: 186 },
  { code: 'JP', country: 'Japan', city: 'Tokyo', ping: 214 },
];
