// Saves letters typed on the site's typewriter into my "Letters" database in Notion.
//
// This is a Cloudflare Worker (free plan). The site can't talk to Notion itself, because the Notion key
// would have to sit in the public page. This tiny helper keeps the key private.
//
// Setup (once): create a Worker in the Cloudflare dashboard, paste this whole file in, and add one secret
// named NOTION_TOKEN (the same Notion integration key the site's deploy uses). Then put the Worker's
// address into LETTERS_URL in index.html.

const LETTERS_DB = '4196e7463165818bb415f972bb467baa';
const ALLOWED = ['https://jamie-catt.com', 'https://www.jamie-catt.com'];

const cors = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
});
const reply = (body, status, origin) => new Response(JSON.stringify(body), { status, headers: cors(origin) });
// Notion text blocks hold 2000 characters each
const chunks = (t) => (t.match(/[\s\S]{1,1900}/g) || []).map((c) => ({ type: 'text', text: { content: c } }));

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'POST') return reply({ success: false, error: 'POST only' }, 405, origin);
    if (!ALLOWED.includes(origin)) return reply({ success: false, error: 'not allowed' }, 403, origin);

    let data;
    try { data = await request.json(); } catch { return reply({ success: false, error: 'bad request' }, 400, origin); }
    const message = String(data.message || '').trim().slice(0, 8000);
    const name = String(data.name || '').trim().slice(0, 80) || 'a visitor';
    const email = String(data.email || '').trim().slice(0, 120);
    if (!message) return reply({ success: false, error: 'empty letter' }, 400, origin);

    const properties = {
      From: { title: [{ type: 'text', text: { content: name } }] },
      Message: { rich_text: chunks(message) },
    };
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) properties.Email = { email };

    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent: { database_id: LETTERS_DB }, properties }),
    });
    if (!res.ok) return reply({ success: false, error: 'notion said no' }, 502, origin);
    return reply({ success: true }, 200, origin);
  },
};
