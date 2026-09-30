'use client';

import { useEffect, useState } from 'react';
import { Button, useAnnounce } from '../../../design-system/primitives';
import { useOperator } from '../../_portal/PortalGate';
import { ReplyBox } from '../../_portal/ReplyBox';
import { HELD_REASONS } from '../../_portal/types';
import type { Message, Reply } from '../../_portal/types';

const VIEWS = [
  { key: 'open', label: 'Waiting' },
  { key: 'held', label: 'Held for review' },
  { key: 'handled', label: 'Handled' },
  { key: 'spam', label: 'Spam' },
] as const;
type View = (typeof VIEWS)[number]['key'];
type Action = 'handled' | 'reopen' | 'release' | 'spam' | 'delete';

const when = (iso: string) => new Date(iso).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });

/** Which actions each list offers, in order. */
const ACTIONS: Record<View, { action: Action; label: string }[]> = {
  open: [{ action: 'handled', label: 'Mark handled' }, { action: 'spam', label: 'Spam' }],
  held: [{ action: 'release', label: 'Not spam' }, { action: 'spam', label: 'Spam' }],
  handled: [{ action: 'reopen', label: 'Reopen' }],
  spam: [{ action: 'release', label: 'Not spam' }],
};
const DONE: Record<Action, string> = { handled: 'Marked handled', reopen: 'Reopened', release: 'Moved to Waiting', spam: 'Marked spam', delete: 'Deleted' };

/**
 * Triage for everything people send us: the contact form and email to
 * anything@adaedit.com, in one list. Reply sends an email from the portal
 * (ReplyBox); the thread of our replies shows under each message. Message
 * text is shown as text, never as HTML. Delete is permanent (replies go with
 * it): use it when a sender asks, as the privacy notice promises.
 */
export default function Messages() {
  const { api } = useOperator();
  const announce = useAnnounce();
  const [view, setView] = useState<View>('open');
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [replying, setReplying] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setMessages(null);
    setFailed(null);
    void api<{ messages: Message[] }>(`/api/portal/messages?view=${view}`).then((r) => {
      if (!live) return;
      if (r.ok && r.data) setMessages(r.data.messages); else setFailed('The messages couldn’t load. Reload to try again.');
    });
    return () => { live = false; };
  }, [api, view]);

  const act = async (m: Message, action: Action, label: string) => {
    if (action === 'delete' && !window.confirm(`Delete the message from ${m.email} for good? This can’t be undone.`)) return;
    const r = await api(`/api/portal/messages/${m.id}`, { method: 'POST', body: JSON.stringify({ action }) });
    if (!r.ok) { setFailed(`${label} didn’t work. Try again.`); return; }
    setFailed(null);
    setMessages((list) => list?.filter((x) => x.id !== m.id) ?? null);
    announce(`${DONE[action]}: message from ${m.email}.`);
  };

  const sent = (m: Message, reply: Reply, handled: boolean) => {
    setReplying(null);
    const leaves = handled && (view === 'open' || view === 'held');
    setMessages((list) => leaves ? list?.filter((x) => x.id !== m.id) ?? null : list?.map((x) => x.id === m.id ? { ...x, replies: [...x.replies, reply] } : x) ?? null);
    announce(`Reply sent to ${m.email}.${leaves ? ' Moved to Handled.' : ''}`);
  };

  const current = VIEWS.find((v) => v.key === view)!;

  return (
    <>
      <div className="portal-titlebar"><h1>Messages</h1></div>
      <nav aria-label="Message lists" className="portal-tabs">
        <ul>
          {VIEWS.map((v) => (
            <li key={v.key}><Button variant={v.key === view ? 'primary' : 'secondary'} aria-pressed={v.key === view} onClick={() => setView(v.key)}>{v.label}</Button></li>
          ))}
        </ul>
      </nav>
      <h2 className="portal-listtitle">{current.label}{messages ? ` (${messages.length})` : ''}</h2>
      {failed ? <p role="alert" className="portal-error">{failed}</p> : null}
      {!messages ? <p>Loading…</p> : messages.length === 0 ? <p>Nothing here.</p> : (
        <ol className="portal-messages">
          {messages.map((m) => {
            const subject = m.subject ?? (m.source === 'form' ? 'Contact form' : '(no subject)');
            return (
              <li key={m.id}>
                <article className="portal-message" aria-labelledby={`m-${m.id}`}>
                  <header>
                    <h3 id={`m-${m.id}`}>{subject}</h3>
                    <p className="portal-meta">
                      From <strong>{m.email}</strong>{m.user_id ? ' (signed in)' : ''}
                      {' · '}{m.source === 'email' ? `Email to ${m.to_address ?? 'us'}` : 'Contact form'}
                      {' · '}<time dateTime={m.created_at}>{when(m.created_at)}</time>
                    </p>
                    {m.status === 'held' && m.held_reason ? <p className="portal-held">Held: {HELD_REASONS[m.held_reason] ?? m.held_reason}</p> : null}
                    {m.follows_up ? <p className="portal-followup">Answer to one of our replies</p> : null}
                  </header>
                  <p className="portal-body">{m.message}</p>
                  {m.replies.length ? (
                    <section className="portal-thread" aria-label={`Our replies to ${m.email}`}>
                      {[...m.replies].sort((a, b) => a.sent_at.localeCompare(b.sent_at)).map((r) => (
                        <div key={r.id} className="portal-sent">
                          <p className="portal-meta">Replied by {r.sent_by} from {r.from_address} · <time dateTime={r.sent_at}>{when(r.sent_at)}</time></p>
                          <p className="portal-body">{r.body}</p>
                        </div>
                      ))}
                    </section>
                  ) : null}
                  {replying === m.id ? <ReplyBox message={m} onSent={(r, h) => sent(m, r, h)} onCancel={() => setReplying(null)} /> : null}
                  {replying === m.id ? null : <div className="portal-actions">
                    <Button variant="primary" onClick={() => setReplying(m.id)}>Reply<span className="ada-visually-hidden"> to {m.email}</span></Button>
                    {ACTIONS[view].map((a) => (
                      <Button key={a.action} variant="secondary" onClick={() => void act(m, a.action, a.label)}>{a.label}<span className="ada-visually-hidden"> for the message from {m.email}</span></Button>
                    ))}
                    <Button variant="ghost" onClick={() => void act(m, 'delete', 'Delete')}>Delete<span className="ada-visually-hidden"> the message from {m.email}</span></Button>
                  </div>}
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
