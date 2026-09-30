export type Stats = {
  days: number;
  messages: { received: number; open: number; held: number; spam: number; by_source: Record<string, number>; held_reasons: Record<string, number>; waiting: number; held_waiting: number };
  visits: {
    views: number;
    visitors: number;
    daily: { day: string; views: number; visitors: number }[];
    pages: { path: string; views: number }[];
    referrers: { host: string; views: number }[];
    devices: Record<string, number>;
    countries: { country: string; views: number }[];
  };
  accounts: { new: number; total: number };
  documents: { total: number };
};

export type Message = {
  id: number;
  created_at: string;
  source: 'form' | 'email';
  email: string;
  to_address: string | null;
  subject: string | null;
  message: string;
  status: 'open' | 'held' | 'spam';
  held_reason: string | null;
  handled_at: string | null;
  user_id: string | null;
  follows_up: number | null;
  replies: Reply[];
};

export type Reply = { id: number; from_address: string; to_address: string; subject: string; body: string; sent_by: string; sent_at: string };

/** Plain-English names for the spam rules' reasons (app/_contact/score.ts, contact_gate()). */
export const HELD_REASONS: Record<string, string> = {
  'disposable-email': 'Throwaway email address',
  'many-links': 'Lots of links',
  'link-shortener': 'Link shortener',
  'spam-phrase': 'Spam phrase',
  shouting: 'Mostly capitals',
  repetition: 'Repeated text',
  ip: 'Many messages from one address',
  net: 'Many messages from one network',
  flood: 'Arrived during a flood',
  unknown: 'Other',
};

/** accessibility+r1a2b@adaedit.com → accessibility@adaedit.com: the address a
 *  reply goes out from, without the conversation tag. */
export const untagged = (address: string) => address.trim().toLowerCase().replace(/\+[^@]*@/, '@');
