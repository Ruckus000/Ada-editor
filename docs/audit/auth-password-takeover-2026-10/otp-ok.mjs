// After the fix: a normal person must still be able to sign in with a code.
const A = 'http://127.0.0.1:54890', M = 'http://127.0.0.1:54891';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (p, b) => { const r = await fetch(A + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const email = `owner-${Date.now()}@example.test`;
const t0 = new Date(Date.now() - 2000);
const otp = await post('/otp', { email, create_user: true });
console.log('POST /otp:', otp.status, otp.body.error_code ?? otp.body.msg ?? 'ok');
let code, subject;
for (let i = 0; i < 30; i++) {
  await sleep(600);
  const list = await (await fetch(`${M}/api/v1/search?query=${encodeURIComponent('to:' + email)}`)).json();
  const m = (list.messages ?? [])[0];
  if (!m) continue;
  const full = await (await fetch(`${M}/api/v1/message/${m.ID}`)).json();
  subject = m.Subject;
  code = ((full.Text || '') + ' ' + (full.HTML || '')).match(/\b\d{6,8}\b/)?.[0];
  if (code) break;
}
console.log('email:', JSON.stringify(subject), '| code:', code ?? 'NOT FOUND');
if (!code) { console.log('RESULT: could not fetch code (mail), inconclusive'); process.exit(2); }
const v = await post('/verify', { type: 'email', email, token: code });
const uid = v.body.user?.id;
console.log('POST /verify:', v.status, v.body.access_token ? `signed in as ${uid?.slice(0,8)}` : JSON.stringify(v.body));
// and password sign-in for this legit user must NOT work (no password exists)
const pw = await post('/token?grant_type=password', { email, password: 'anything-at-all-123' });
console.log('password grant for same user:', pw.status, pw.body.access_token ? 'SESSION (unexpected)' : pw.body.error_code ?? pw.body.msg);
console.log(`RESULT: OTP sign-in ${v.body.access_token ? 'WORKS' : 'BROKEN'} after the fix; password grant ${pw.body.access_token ? 'WORKS (bad)' : 'rejected (good)'}`);
