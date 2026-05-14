// Vercel serverless function — POST /api/trigger-call
// Triggers an outbound AI call to the visitor's phone via Retell.
//
// Required env vars (set in Vercel project settings → Environment Variables):
//   RETELL_API_KEY     — your Retell API key
//   RETELL_FROM_NUMBER — the Retell-managed (or imported) outbound phone number, E.164 format
//   RETELL_AGENT_ID    — the agent ID to use for the outbound call
//
// Optional:
//   ALLOWED_ORIGIN     — origin to allow CORS from (default: same origin only)

const RETELL_ENDPOINT = 'https://api.retellai.com/v2/create-phone-call';

// Naive in-memory rate limit — survives a single warm function instance only.
// Good enough to slow down casual abuse during the conference; for serious
// protection put Cloudflare Turnstile or a Redis-backed limiter in front.
const recentCalls = new Map(); // phone -> timestamp
const RATE_LIMIT_MS = 3 * 60 * 1000; // one call per phone per 3 minutes

function isValidE164US(n) {
  return typeof n === 'string' && /^\+1\d{10}$/.test(n);
}

function json(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const { RETELL_API_KEY, RETELL_FROM_NUMBER, RETELL_AGENT_ID } = process.env;
  if (!RETELL_API_KEY || !RETELL_FROM_NUMBER) {
    console.error('Missing required env vars: RETELL_API_KEY and/or RETELL_FROM_NUMBER');
    return json(res, 500, { error: 'Server not configured. Come find us at the booth.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const phone = body.phone;
  const source = typeof body.source === 'string' ? body.source : 'web';

  if (!isValidE164US(phone)) {
    return json(res, 400, { error: 'Please enter a valid 10-digit US phone number.' });
  }

  const now = Date.now();
  const last = recentCalls.get(phone);
  if (last && now - last < RATE_LIMIT_MS) {
    const wait = Math.ceil((RATE_LIMIT_MS - (now - last)) / 1000);
    return json(res, 429, { error: `We just called that number. Try again in ${wait}s.` });
  }
  recentCalls.set(phone, now);

  const payload = {
    from_number: RETELL_FROM_NUMBER,
    to_number: phone,
    ...(RETELL_AGENT_ID ? { override_agent_id: RETELL_AGENT_ID } : {}),
    retell_llm_dynamic_variables: {
      source,
      scanned_at: new Date().toISOString(),
      context: 'Visitor scanned the MindBill QR code at the APA 2026 conference in the Startup Zone.',
    },
    metadata: {
      source,
      origin: 'apa-2026-landing',
      user_agent: req.headers['user-agent'] || '',
    },
  };

  try {
    const retellRes = await fetch(RETELL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RETELL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await retellRes.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!retellRes.ok) {
      console.error('Retell create-phone-call failed', retellRes.status, data);
      return json(res, 502, {
        error: data?.error_message || data?.message || 'Could not place the call right now.',
      });
    }

    return json(res, 200, {
      ok: true,
      call_id: data?.call_id,
      message: 'Call dispatched.',
    });
  } catch (err) {
    console.error('Retell call dispatch threw', err);
    return json(res, 500, { error: 'Network error. Try again, or come find us at the booth.' });
  }
}
