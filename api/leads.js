// GET /api/leads?token=XXXX  → all captured leads as CSV (or &format=json)
//
// Convenience export (you also have the Airtable UI/app). Pull on your phone
// at the booth without logging into Airtable.
//
// Env: AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE, LEADS_ADMIN_TOKEN

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const token = (req.query && req.query.token) || '';
  const ADMIN = process.env.LEADS_ADMIN_TOKEN;
  if (!ADMIN || token !== ADMIN) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
    res.status(500).json({ error: 'Airtable not configured' });
    return;
  }

  const base = process.env.AIRTABLE_BASE_ID;
  const table = encodeURIComponent(process.env.AIRTABLE_TABLE || 'Leads');

  try {
    const records = [];
    let offset;
    do {
      const u = new URL(`https://api.airtable.com/v0/${base}/${table}`);
      u.searchParams.set('pageSize', '100');
      if (offset) u.searchParams.set('offset', offset);
      const r = await fetch(u, { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } });
      if (!r.ok) { res.status(502).json({ error: 'Airtable read failed', status: r.status }); return; }
      const d = await r.json();
      for (const rec of d.records || []) records.push({ id: rec.id, ...rec.fields });
      offset = d.offset;
    } while (offset);

    records.sort((a, b) => String(b.Submitted || '').localeCompare(String(a.Submitted || '')));

    if ((req.query && req.query.format) === 'json') {
      res.status(200).json({ count: records.length, leads: records });
      return;
    }

    const cols = ['Submitted', 'Status', 'Name', 'Email', 'Phone', 'Practice', 'Interested In', 'Source', 'id'];
    const rows = [cols.join(',')];
    for (const l of records) rows.push(cols.map((c) => csvCell(l[c])).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mindbill-apa-leads.csv"');
    res.status(200).send(rows.join('\n'));
  } catch (err) {
    console.error('leads export failed', err);
    res.status(500).json({ error: 'Could not list leads' });
  }
}
