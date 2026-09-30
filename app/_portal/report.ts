import type { Stats } from './types';
import { HELD_REASONS } from './types';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Plain text first (it's what many readers get), and a matching simple HTML
 *  version. Numbers and a link only: no message text leaves the portal. */
function render(title: string, lines: string[], portal: string) {
  const text = [title, '', ...lines, '', `Open the portal: ${portal}`].join('\n');
  const html = `<!doctype html><html lang="en"><body style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#161C24">`
    + `<h1 style="font-size:20px">${esc(title)}</h1>`
    + `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
    + `<p><a href="${esc(portal)}">Open the portal</a></p></body></html>`;
  return { text, html };
}

export function alertEmail(count: number, portal: string) {
  const title = `${count} new ${count === 1 ? 'message is' : 'messages are'} waiting`;
  return { subject: `Ada Editor: ${title}`, ...render(title, ['Sent through the contact form or by email to adaedit.com. Held messages aren’t counted.'], portal) };
}

export function weeklyEmail(s: Stats, portal: string) {
  const reasons = Object.entries(s.messages.held_reasons).map(([r, n]) => `${HELD_REASONS[r] ?? r} ${n}`).join(', ');
  const top = s.visits.pages.slice(0, 3).map((p) => `${p.path} (${p.views})`).join(', ');
  const lines = [
    `Waiting for a reply: ${s.messages.waiting} (held for review: ${s.messages.held_waiting})`,
    `Received this week: ${s.messages.received} (form ${s.messages.by_source.form ?? 0}, email ${s.messages.by_source.email ?? 0}); held ${s.messages.held}${reasons ? ` (${reasons})` : ''}; marked spam ${s.messages.spam}`,
    `Public site: ${s.visits.visitors} visitors, ${s.visits.views} page views${top ? `; top pages ${top}` : ''}`,
    `Accounts: ${s.accounts.new} new, ${s.accounts.total} in all. Documents: ${s.documents.total}.`,
  ];
  return { subject: 'Ada Editor: your week', ...render('Your week at Ada Editor', lines, portal) };
}
