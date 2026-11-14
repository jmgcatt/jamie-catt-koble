#!/usr/bin/env node
// Pulls my three Notion databases into data/*.json for the website.
//
//   npm run sync
//
// Needs NOTION_TOKEN, NOTION_QUOTES_DB, NOTION_FAVES_DB and NOTION_COOKING_DB (NOTION_BOOKS_DB is optional), either from a local
// .env file (never committed) or from the environment, so a GitHub Action can pass them as secrets.
// Every row in each database is published. Images are downloaded into assets/notion/
// so the site never points at Notion's temporary file links.
//
// Property names below are the exact ones in my databases (checked 2026-11-13). Blank values are
// dropped.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const ASSET_DIR = path.join(ROOT, 'assets', 'notion');
const API = process.env.NOTION_API_URL || 'https://api.notion.com/v1'; // override only for testing
const NOTION_VERSION = '2025-09-03';
const OPEN_LIBRARY = process.env.OPEN_LIBRARY_URL || 'https://openlibrary.org'; // override only for testing

const DATABASES = [
  {
    env: 'NOTION_QUOTES_DB', file: 'quotes.json', key: 'quotes', label: 'Quotes',
    // Quote (title), Author (text), Source (text); optional: Author link (url), Source link (url)
    row: (p) => ({
      quote: text(p, 'Quote'),
      author: text(p, 'Author'),
      source: text(p, 'Source'),
      author_url: url(p, 'Author link'),
      source_url: url(p, 'Source link') || link(p, 'Source'),
    }),
    keep: (r) => r.quote,
    // newest first
    sort: (a, b) => b._created.localeCompare(a._created),
  },
  {
    env: 'NOTION_FAVES_DB', file: 'faves.json', key: 'faves', label: 'Favorite (Monthly Faves)',
    // Item (title), Month (select), Year (select); optional: Link (url), Description (text),
    // Image (files, or the page cover), Art (select: book, lotion, balm, tea, coffee, candle, scent), Color (text, like #3f6aa0)
    row: (p) => ({
      title: text(p, 'Item'),
      month: text(p, 'Month'),
      year: text(p, 'Year'),
      url: url(p, 'Link'),
      description: text(p, 'Description'),
      art: text(p, 'Art').toLowerCase(),
      color: text(p, 'Color'),
      image: files(p, 'Image')[0] || cover(p),
    }),
    keep: (r) => r.title,
    // a book fave with no Link gets its Goodreads page
    enrich: async (r) => { if (r.art === 'book' && !r.url) r.url = (await findBook(r.title)).url; },
    sort: (a, b) => monthKey(b) - monthKey(a) || b._created.localeCompare(a._created),
  },
  {
    env: 'NOTION_COOKING_DB', file: 'cooking.json', key: 'cooking', label: 'On The Menu (What I’m Cooking)',
    // Dish (title), Date (date), Note (text), Image (files, or the page cover),
    // Art (select: quesadilla, chili-chicken, rice, cottage-peaches; picks the drawing)
    row: (p) => ({
      dish: text(p, 'Dish'),
      date: date(p, 'Date'),
      note: text(p, 'Note'),
      art: text(p, 'Art').toLowerCase(),
      image: files(p, 'Image')[0] || cover(p),
    }),
    keep: (r) => r.dish,
    sort: (a, b) => (b.date || '').localeCompare(a.date || '') || b._created.localeCompare(a._created),
  },
  {
    env: 'NOTION_BOOKS_DB', file: 'books.json', key: 'books', label: 'Reads (book recommendations)', optional: true,
    // Book Title (title), Author (text), Description (text); optional: Goodreads (url, overrides the one found automatically)
    row: (p) => ({
      title: text(p, 'Book Title'),
      author: text(p, 'Author'),
      description: text(p, 'Description'),
      url: url(p, 'Goodreads'),
    }),
    keep: (r) => r.title,
    // the Goodreads page and the real cover, found from the title and author
    enrich: async (r) => { const b = await findBook(r.title, r.author); r.url ||= b.url; r.image = b.cover; },
    sort: (a, b) => b._created.localeCompare(a._created),
  },
];

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthKey = (r) => (parseInt(r.year, 10) || 0) * 12 + MONTHS.indexOf(String(r.month).toLowerCase());

// ---------- reading Notion property values ----------
const prop = (page, name) => page.properties?.[name];
const plain = (rich = []) => rich.map((t) => t.plain_text).join('').trim();
function text(page, name) {
  const v = prop(page, name);
  if (!v) return '';
  switch (v.type) {
    case 'title': return plain(v.title);
    case 'rich_text': return plain(v.rich_text);
    case 'select': return v.select?.name || '';
    case 'status': return v.status?.name || '';
    case 'multi_select': return v.multi_select.map((o) => o.name).join(', ');
    case 'number': return v.number == null ? '' : String(v.number);
    case 'url': return v.url || '';
    default: return '';
  }
}
const url = (page, name) => { const u = text(page, name) || prop(page, name)?.url || ''; return /^https?:\/\//i.test(u) ? u : ''; };
// a link typed inside a text property, like a source title linked to the article
const link = (page, name) => { const v = prop(page, name); const h = (v?.[v?.type] || []).find?.((t) => t.href)?.href || ''; return /^https?:\/\//i.test(h) ? h : ''; };
const date = (page, name) => prop(page, name)?.date?.start || '';
const fileUrl = (f) => (f?.type === 'external' ? f.external.url : f?.type === 'file' ? f.file.url : '');
const files = (page, name) => (prop(page, name)?.files || []).map(fileUrl).filter(Boolean);
const cover = (page) => fileUrl(page.cover);

// ---------- books: a Goodreads link and the cover, via Open Library ----------
// Goodreads has no public search, but /book/isbn/<isbn> lands on the book's page, so an ISBN is enough.
// Never fails: without a match the link is a Goodreads search and there is no cover.
async function findBook(title, author = '') {
  const search = `https://www.goodreads.com/search?q=${encodeURIComponent([title, author].filter(Boolean).join(' '))}`;
  try {
    const q = new URLSearchParams({ title, fields: 'cover_i,isbn', limit: '1' });
    if (author) q.set('author', author);
    const res = await fetch(`${OPEN_LIBRARY}/search.json?${q}`, { headers: { 'User-Agent': 'jamie-catt-koble website sync' }, signal: AbortSignal.timeout(15000) });
    const doc = res.ok ? (await res.json()).docs?.[0] : null;
    if (!doc) return { url: search, cover: '' };
    const isbns = doc.isbn || [];
    const isbn = isbns.find((i) => /^97[89]\d{10}$/.test(i)) || isbns.find((i) => /^\d{9}[\dX]$/i.test(i));
    return {
      url: isbn ? await goodreadsPage(isbn) : search,
      // -L is the largest size Open Library serves
      cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : '',
    };
  } catch (err) {
    console.warn(`  couldn't look up "${title}" (${err.message}), linking a Goodreads search instead`);
    return { url: search, cover: '' };
  }
}
// follow the ISBN link once to get the clean /book/show/ address; if Goodreads won't say, the ISBN link still works
async function goodreadsPage(isbn) {
  const byIsbn = `https://www.goodreads.com/book/isbn/${isbn}`;
  try {
    const res = await fetch(byIsbn, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
    const to = res.headers.get('location') || '';
    return /^https:\/\/www\.goodreads\.com\/book\/show\//.test(to) ? to.split('?')[0] : byIsbn;
  } catch { return byIsbn; }
}

// ---------- Notion API ----------
async function notion(method, endpoint, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + endpoint, {
      method,
      headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 4) { await sleep((Number(res.headers.get('retry-after')) || 1) * 1000); continue; }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${endpoint} failed (${res.status}): ${json.message || res.statusText}`);
    return json;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a database id from the Notion link works; the API wants the id of its data source
async function dataSourceOf(databaseId) {
  const db = await notion('GET', `/databases/${databaseId}`);
  const ds = db.data_sources?.[0];
  if (!ds) throw new Error(`database ${databaseId} has no data source`);
  return notion('GET', `/data_sources/${ds.id}`);
}

async function queryAll(dataSourceId) {
  const rows = [];
  let cursor;
  do {
    const page = await notion('POST', `/data_sources/${dataSourceId}/query`, { page_size: 100, start_cursor: cursor });
    rows.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return rows;
}

// ---------- images: saved locally, always the original file ----------
const IMG_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif', 'image/svg+xml': '.svg' };
async function saveImage(src, baseName, keep) {
  if (!src) return '';
  const res = await fetch(src);
  if (!res.ok) { console.warn(`  could not download an image (${res.status}), skipping it`); return ''; }
  const type = (res.headers.get('content-type') || '').split(';')[0];
  const ext = IMG_TYPES[type] || path.extname(new URL(src).pathname).toLowerCase() || '.jpg';
  const name = baseName + ext;
  await writeAtomic(path.join(ASSET_DIR, name), Buffer.from(await res.arrayBuffer()));
  keep.add(name);
  return `assets/notion/${name}`;
}

async function writeAtomic(file, data) {
  await fs.writeFile(file + '.part', data);
  await fs.rename(file + '.part', file);
}

// ---------- .env for local runs (real environment variables win, so CI secrets work as-is) ----------
async function loadEnv() {
  let raw;
  try { raw = await fs.readFile(path.join(ROOT, '.env'), 'utf8'); } catch { return; }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

async function syncOne(db, keepImages) {
  const id = (process.env[db.env] || '').replace(/-/g, '').match(/[0-9a-f]{32}/i)?.[0];
  if (!id && db.optional && !process.env[db.env]) return null;
  if (!id) throw new Error(`${db.env} is missing or isn't a Notion database id`);
  const source = await dataSourceOf(id);
  const pages = await queryAll(source.id);
  const rows = [];
  for (const page of pages) {
    const r = db.row(page);
    if (!db.keep(r)) continue;
    if (db.enrich) await db.enrich(r);
    if (r.image) r.image = await saveImage(r.image, `${db.key}-${page.id.replace(/-/g, '')}`, keepImages);
    rows.push({ ...r, _created: page.created_time });
  }
  rows.sort(db.sort);
  // clean output: no empty fields, no Notion internals
  return rows.map(({ _created, ...r }) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== '')));
}

async function main() {
  await loadEnv();
  if (!process.env.NOTION_TOKEN) throw new Error('NOTION_TOKEN is missing. Add it to .env (see README.md).');
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(ASSET_DIR, { recursive: true });
  const keepImages = new Set();
  let failed = 0;
  for (const db of DATABASES) {
    try {
      const rows = await syncOne(db, keepImages);
      if (rows === null) { console.log(`${db.label}: skipped (${db.env} isn't set)`); continue; }
      await writeAtomic(path.join(DATA_DIR, db.file), JSON.stringify({ [db.key]: rows }, null, 2) + '\n');
      console.log(`${db.label}: ${rows.length} item(s) → data/${db.file}`);
    } catch (err) {
      // leave the last good file in place so the site keeps working
      failed++;
      console.error(`${db.label}: ${err.message}`);
    }
  }
  // remove images whose rows are gone, but only after a fully successful run
  if (!failed) {
    for (const name of await fs.readdir(ASSET_DIR)) if (!keepImages.has(name)) await fs.rm(path.join(ASSET_DIR, name));
  }
  if (failed) process.exitCode = 1;
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
