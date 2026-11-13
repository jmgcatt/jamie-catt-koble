#!/usr/bin/env python3
"""Add new posts from my Substack to the journal (posts.json + media/posts/).

Run it from the website folder:  python3 scripts/sync-substack.py
The GitHub Action in .github/workflows/sync-substack.yml runs it every 30 minutes.

Media is always the highest resolution available:
- images: the original upload from Substack's storage, never a resized CDN copy.
  Images with transparency are placed on white (the way Substack shows them)
  and saved as full-resolution JPEGs. Pillow is used for that; without it the
  original file is kept as-is.
- videos: Substack's top public rendition ("high", 1080p).

Only new posts are added. Posts already in posts.json are left alone, so any
edits made by hand are kept. Paid-only posts are skipped.
"""
import html
import json
import os
import re
import sys
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime
from html.parser import HTMLParser

PUB = 'https://jamiecatt.substack.com'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTS_FILE = os.path.join(ROOT, 'posts.json')
MEDIA_DIR = os.path.join(ROOT, 'media', 'posts')
UA = {'User-Agent': 'Mozilla/5.0 (jamie-catt journal sync)'}
JPEG_QUALITY = 92

try:
    from PIL import Image
except ImportError:
    Image = None


def get(url, binary=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        data = r.read()
    return data if binary else data.decode('utf-8')


def get_json(url):
    return json.loads(get(url))


def original_image_url(src):
    """Turn a substackcdn.com/image/fetch/<options>/<original> URL into the original."""
    if 'substackcdn.com/image/fetch/' in src:
        tail = src.split('/image/fetch/', 1)[1]
        m = re.search(r'(https?%3A%2F%2F.*|https?://.*)$', tail)
        if m:
            return urllib.parse.unquote(m.group(1))
    return src


def save_image(url, dest_base):
    """Download an image at full size; returns the saved file name."""
    data = get(url, binary=True)
    ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower() or '.jpg'
    if ext == '.gif' or Image is None:
        name = dest_base + ('.jpeg' if ext == '.jpeg' else ext)
        write_file(name, data)
        return name
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as t:
        t.write(data)
    try:
        img = Image.open(t.name)
        img.load()
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            rgba = img.convert('RGBA')
            flat = Image.new('RGB', rgba.size, (255, 255, 255))
            flat.paste(rgba, mask=rgba.split()[-1])
            img = flat
        else:
            img = img.convert('RGB')
        name = dest_base + '.jpg'
        out = os.path.join(MEDIA_DIR, name)
        img.save(out + '.part', 'JPEG', quality=JPEG_QUALITY, optimize=True, progressive=True, subsampling=0)
        os.replace(out + '.part', out)
        return name
    finally:
        os.unlink(t.name)


def save_video(upload_id, dest_base):
    data = get(f'{PUB}/api/v1/video/upload/{upload_id}/src', binary=True)
    name = dest_base + '.mp4'
    write_file(name, data)
    return name


def write_file(name, data):
    out = os.path.join(MEDIA_DIR, name)
    with open(out + '.part', 'wb') as f:
        f.write(data)
    os.replace(out + '.part', out)


class PostHTML(HTMLParser):
    """Keeps the writing (paragraphs, links, quotes, lists, headings) and swaps
    every image and video for a {{m:name}} placeholder pointing at media/posts/."""
    KEEP = {'p': 'p', 'em': 'em', 'i': 'em', 'strong': 'strong', 'b': 'strong', 'blockquote': 'blockquote',
            'ul': 'ul', 'ol': 'ol', 'li': 'li', 'br': 'br', 'h1': 'h3', 'h2': 'h3', 'h3': 'h3', 'h4': 'h4',
            'figcaption': 'figcaption', 'hr': 'hr'}
    SKIP_TAGS = {'script', 'style', 'svg', 'button', 'form', 'iframe', 'source', 'noscript', 'input'}
    SKIP_CLASSES = ('subscription-widget', 'subscribe-widget', 'button-wrapper', 'captioned-button-wrap',
                    'image-link-expand', 'footnote-anchor', 'share-dialog', 'poll-embed', 'digest-post-embed')

    def __init__(self, key):
        super().__init__(convert_charrefs=True)
        self.key, self.out, self.skip, self.stack = key, [], 0, []
        self.images = self.videos = 0
        self.in_figure = False

    def media_name(self, kind):
        if kind == 'image':
            self.images += 1
            return f'{self.key}-{self.images}'
        self.videos += 1
        return f'{self.key}-v{self.videos}'

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get('class') or ''
        if self.skip:
            if tag not in ('br', 'img', 'hr', 'source', 'input'):
                self.skip += 1
            return
        if tag in self.SKIP_TAGS or any(c in cls for c in self.SKIP_CLASSES):
            if tag not in ('br', 'img', 'hr', 'source', 'input'):
                self.skip = 1
            return
        if tag == 'div' and ('native-video-embed' in cls or a.get('data-component-name') == 'VideoPlaceholder'):
            info = json.loads(html.unescape(a.get('data-attrs') or '{}'))
            if info.get('mediaUploadId'):
                name = save_video(info['mediaUploadId'], self.media_name('video'))
                self.out.append(f'<video controls playsinline preload="metadata" src="{{{{m:{name}}}}}"></video>')
            self.skip = 1
            return
        if tag == 'div' and 'image-gallery-embed' in cls:
            info = json.loads(html.unescape(a.get('data-attrs') or '{}'))
            for im in (info.get('gallery') or {}).get('images') or []:
                if im.get('src'):
                    self.add_image(original_image_url(im['src']))
            self.skip = 1
            return
        if tag == 'div' and 'youtube-wrap' in cls:
            info = json.loads(html.unescape(a.get('data-attrs') or '{}'))
            if info.get('videoId'):
                self.out.append(f'<p><a href="https://www.youtube.com/watch?v={html.escape(info["videoId"])}" target="_blank" rel="noopener">Watch on YouTube</a></p>')
            self.skip = 1
            return
        if tag == 'figure':
            self.in_figure = True
            self.out.append('<figure>')
            self.stack.append('figure')
            return
        if tag == 'img':
            info = json.loads(html.unescape(a.get('data-attrs') or '{}')) if a.get('data-attrs') else {}
            src = info.get('src') or a.get('src') or ''
            if src:
                self.add_image(original_image_url(src), a.get('alt') or '')
            return
        if tag == 'a':
            href = a.get('href') or ''
            if not self.in_figure and href.startswith(('http://', 'https://', 'mailto:')):
                self.out.append(f'<a href="{html.escape(href)}" target="_blank" rel="noopener">')
                self.stack.append('a')
            else:
                self.stack.append(None)
            return
        if tag in self.KEEP:
            t = self.KEEP[tag]
            self.out.append(f'<{t}>')
            if t not in ('br', 'hr'):
                self.stack.append(t)
            return
        self.stack.append(None)

    def add_image(self, url, alt=''):
        name = save_image(url, self.media_name('image'))
        img = f'<a href="{html.escape(url)}" target="_blank" rel="noopener"><img src="{{{{m:{name}}}}}" alt="{html.escape(alt)}" loading="lazy"></a>'
        self.out.append(img if self.in_figure else f'<figure>{img}</figure>')

    def handle_endtag(self, tag):
        if self.skip:
            self.skip -= 1
            return
        if tag in ('br', 'img', 'hr', 'source', 'input'):
            return
        if not self.stack:
            return
        t = self.stack.pop()
        if t == 'figure':
            self.in_figure = False
        if t:
            self.out.append(f'</{t}>')

    def handle_data(self, data):
        if not self.skip:
            self.out.append(html.escape(data, quote=False))

    def result(self):
        s = ''.join(self.out)
        s = re.sub(r'<(p|em|strong|h3|h4|li|blockquote|figcaption)>\s*</\1>', '', s)
        s = re.sub(r'<figure>\s*</figure>', '', s)
        return s.strip()


def nice_date(iso):
    d = datetime.fromisoformat(iso.replace('Z', '+00:00'))
    return f'{d:%b} {d.day}, {d.year}'


def main():
    with open(POSTS_FILE, encoding='utf-8') as f:
        store = json.load(f)
    posts = store.setdefault('posts', [])
    by_slug = {p.get('slug'): p for p in posts}
    os.makedirs(MEDIA_DIR, exist_ok=True)

    feed = get_json(f'{PUB}/api/v1/posts?limit=20')
    feed = feed.get('posts', feed) if isinstance(feed, dict) else feed
    added = []
    for item in feed:
        slug = item.get('slug')
        if not slug or item.get('type') not in (None, 'newsletter'):
            continue
        if slug in by_slug:
            by_slug[slug].setdefault('published', item.get('post_date'))
            continue
        if item.get('audience') not in (None, 'everyone'):
            print(f'skipping paid-only post: {slug}')
            continue
        full = get_json(f'{PUB}/api/v1/posts/{slug}')
        key = re.sub(r'[^a-z0-9-]', '', slug.lower())[:60] or str(item.get('id'))
        body = PostHTML(key)
        body.feed(full.get('body_html') or '')
        post = {
            'key': key,
            'slug': slug,
            'title': full.get('title') or slug,
            'date': nice_date(full.get('post_date')),
            'published': full.get('post_date'),
            'blurb': full.get('subtitle') or full.get('description') or '',
            'url': full.get('canonical_url') or f'{PUB}/p/{slug}',
            'html': body.result(),
        }
        posts.append(post)
        by_slug[slug] = post
        added.append(slug)
        print(f'added: {slug} ({body.images} images, {body.videos} videos)')

    posts.sort(key=lambda p: p.get('published') or '', reverse=True)
    with open(POSTS_FILE + '.part', 'w', encoding='utf-8') as f:
        json.dump(store, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(POSTS_FILE + '.part', POSTS_FILE)
    print(f'{len(added)} new post(s)' if added else 'journal is up to date')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'sync failed: {e}', file=sys.stderr)
        sys.exit(1)
