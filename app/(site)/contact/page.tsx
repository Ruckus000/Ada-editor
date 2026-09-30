import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactForm } from '../../_contact/ContactForm';
import { PageSection, SitePage } from '../../_site/SitePage';
import './contact.css';

export const metadata: Metadata = { title: 'Contact · Ada Editor' };

/** Shown only once it's set (Vercel env), so an invented address never ships. */
const EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

const TOC = [
  { id: 'message', label: 'Send a message' },
  ...(EMAIL ? [{ id: 'email', label: 'Email' }] : []),
  { id: 'data', label: 'What we keep' },
];

/**
 * Public: no account needed, because someone blocked from signing in is
 * exactly who has to be able to reach us. No reply time is promised: messages
 * are read by hand in Supabase, with no notification.
 */
export default function Page() {
  return (
    <SitePage
      eyebrow="Contact"
      title="Tell a person."
      tint="violet"
      toc={TOC}
      lead="Report an accessibility barrier, ask about your data, or anything else. You don’t need an account."
    >
      <PageSection id="message" title="Send a message">
        <ContactForm />
      </PageSection>

      {EMAIL ? (
        <PageSection id="email" title="Email">
          <p>Prefer email? Write to <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>
        </PageSection>
      ) : null}

      <PageSection id="data" title="What we keep">
        <p>
          Your message and the address to reply to. If you’re signed in, it’s deleted with your account; if not, we keep it
          until we delete it, and you can ask us to do that at any time. The <Link href="/privacy">privacy notice</Link> has
          the details.
        </p>
      </PageSection>
    </SitePage>
  );
}
