// POST /api/lead — two-step conference lead capture, stored in Airtable.
//
// STEP 1 (no lead_id): phone only → create Airtable row (Status "Phone only"),
//   fire the AI demo call immediately, return { lead_id } = Airtable record id.
// STEP 2 (lead_id present): name/email/practice/service → PATCH that row,
//   set Status "New". No call.
//
// Env (Vercel → Settings → Environment Variables):
//   AIRTABLE_API_KEY    — personal access token
//   AIRTABLE_BASE_ID    — appzhfpUiJMZf88TI
//   AIRTABLE_TABLE      — Leads
//   RETELL_API_KEY, RETELL_FROM_NUMBER, RETELL_AGENT_ID(optional)

const RETELL_ENDPOINT = 'https://api.retellai.com/v2/create-phone-call';

function json(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}
const isEmail = (s) => typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const isE164US = (s) => typeof s === 'string' && /^\+1\d{10}$/.test(s);
const isRecId = (s) => typeof s === 'string' && /^rec[A-Za-z0-9]{14,17}$/.test(s);
const clean = (s, max = 200) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

function airtableUrl(extra = '') {
  const base = process.env.AIRTABLE_BASE_ID;
  const table = encodeURIComponent(process.env.AIRTABLE_TABLE || 'Leads');
  return `https://api.airtable.com/v0/${base}/${table}${extra}`;
}
async function airtable(method, path, fields) {
  const r = await fetch(airtableUrl(path), {
    method,
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields, typecast: true }),
  });
  const txt = await r.text();
  let d; try { d = JSON.parse(txt); } catch { d = { raw: txt }; }
  return { ok: r.ok, status: r.status, data: d };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
    console.error('Airtable env not configured');
    return json(res, 500, { error: 'Lead store not configured. Come find us at the booth.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const leadId = clean(body.lead_id, 40);

  // ───────── STEP 2: enrich existing Airtable row ─────────
  if (leadId) {
    if (!isRecId(leadId)) return json(res, 400, { error: 'Bad lead reference.' });
    const fullname = clean(body.fullname, 120);
    const email = clean(body.email, 160);
    const practice = clean(body.practice, 160);
    const service = clean(body.service, 80);

    if (!fullname) return json(res, 400, { error: 'Name is required.' });
    if (!isEmail(email)) return json(res, 400, { error: 'A valid email is required.' });
    if (!practice) return json(res, 400, { error: 'Practice name is required.' });
    if (!service) return json(res, 400, { error: 'Please select what would help most.' });

    const r = await airtable('PATCH', `/${leadId}`, {
      Name: fullname,
      Email: email,
      Practice: practice,
      'Interested In': service,
      Status: 'New',
    });
    if (!r.ok) {
      console.error('Airtable PATCH failed', r.status, r.data);
      return json(res, 502, { error: 'Could not save. Come find us at the booth.' });
    }
    return json(res, 200, { ok: true });
  }

  // ───────── STEP 1: phone only → create row + call ─────────
  const phone = clean(body.phone, 20);
  const source = clean(body.source, 40) || 'apa_qr';
  if (!isE164US(phone)) return json(res, 400, { error: 'Enter a valid 10-digit US mobile number.' });

  const create = await airtable('POST', '', {
    Phone: phone,
    Status: 'Phone only',
    Source: source,
    Submitted: new Date().toISOString(),
  });
  if (!create.ok || !create.data?.id) {
    console.error('Airtable create failed', create.status, create.data);
    return json(res, 502, { error: 'Could not start. Try again or come find us at the booth.' });
  }
  const recordId = create.data.id;

  const { RETELL_API_KEY, RETELL_FROM_NUMBER, RETELL_AGENT_ID } = process.env;
  if (!RETELL_API_KEY || !RETELL_FROM_NUMBER) {
    return json(res, 200, { ok: true, called: false, lead_id: recordId, note: 'Saved. Call service not configured.' });
  }

  try {
    const rr = await fetch(RETELL_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RETELL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_number: RETELL_FROM_NUMBER,
        to_number: phone,
        ...(RETELL_AGENT_ID ? { override_agent_id: RETELL_AGENT_ID } : {}),
        retell_llm_dynamic_variables: { source, lead_id: recordId },
        metadata: { lead_id: recordId, phone, source, origin: 'apa-2026-landing' },
      }),
    });
    const txt = await rr.text();
    let d; try { d = JSON.parse(txt); } catch { d = { raw: txt }; }
    if (!rr.ok) {
      console.error('Retell failed', rr.status, d);
      return json(res, 200, { ok: true, called: false, lead_id: recordId });
    }
    return json(res, 200, { ok: true, called: true, lead_id: recordId, call_id: d?.call_id });
  } catch (err) {
    console.error('Retell dispatch threw', err);
    return json(res, 200, { ok: true, called: false, lead_id: recordId });
  }
}
