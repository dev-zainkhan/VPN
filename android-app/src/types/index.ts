// A location in the picker. `id` is the AWS region code ("FAST" for automatic choice),
// `code` the two-letter country code shown in the badge.
export type Location = {
  id: string;
  code: string;
  country: string;
  city: string;
  ping: number | null;
  pingHost?: string;
};

export type Protocol = 'Auto' | 'UDP' | 'TCP';

export const FASTEST: Location = { id: 'FAST', code: 'FAST', country: 'Fastest location', city: 'Automatic', ping: null };
