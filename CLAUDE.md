# Jamie Catt-Koble's site: notes for Claude

Jamie Catt-Koble's portfolio: an interactive, colored-pencil illustration of their tiny house with their tri-color Maltipoo, Teo. Jamie is a designer, illustrator and writer, and edits this site by chatting with Claude, often from their phone. They don't code, so do the whole job: make the change, check it, and ship it when asked.

## How Jamie works with you

- **Ship every change automatically.** Jamie wants each update live as soon as it's done and checked, without being asked: commit to `main` with a short, plain message, push, watch the **Deploy site** GitHub Action until it finishes, check the live site, and fix anything that broke. Don't ask Jamie to run commands or use GitHub Desktop.
- If you're working on a branch (cloud sessions often are), shipping means getting the change onto `main`: merge the branch or pull request yourself.
- Jamie reviews visually. Describe changes in terms of what they'll see, not code. Small, careful tweaks: don't redesign things they didn't mention.
- Jamie often sends follow-up requests while you're working. Fold them into the current work.

## What's here

- `index.html`: the whole site: one SVG scene plus all the sheets (modals), styles and scripts. **Write it ASCII-only**: escape anything else as `\uXXXX` in JS, or as HTML entities.
- `posts.json`, `media/posts/`: journal posts from Substack. Each post can have a `tag` shown beside its date, added by hand: `life with Teo` for anything about Teo, `writing` for essays like "returning home". Substack blocks GitHub's servers, so when Jamie says they've posted, run `python3 scripts/sync-substack.py` in the session (it needs `jamiecatt.substack.com`, `substack-post-media.s3.amazonaws.com` and `substackcdn.com` allowed in the environment's network settings), then ship. `.github/workflows/sync-substack.yml` runs the same script, by hand only.
- `scripts/sync-notion.js`: `npm run sync` turns Jamie's Notion databases into `data/*.json` and `assets/notion/`. Those are **built on every deploy and never committed** (they're in `.gitignore`).
- `.github/workflows/deploy.yml`: runs the Notion sync and publishes to GitHub Pages on every push to `main`, every hour, and after a Substack sync. The only secret is `NOTION_TOKEN`; the database IDs are in the workflow.
- Live site: https://jamie-catt.com (DNS at Squarespace, pointing to GitHub Pages).

## Notion (the "Jamie Catt-Koble" page)

| Database | Columns the site reads | Shows up as |
|---|---|---|
| Quotes | Quote, Author, Source, Author link, Source link | "quote" tickets |
| Favorites | Item, Month, Year, Link, Description, Image, Art, Color | "favorite" tickets and Monthly faves |
| Reads | Book Title, Author, Description, Goodreads (optional) | "read" tickets and the books in the reading stack; the cover comes from the Goodreads link (else Open Library) |
| On The Menu | Dish, Date, Note, Image, Art | "What I'm cooking" menu cards |
| What I'm Drinking | Drink, Date, Note, Image, Art | "What I'm drinking" tea bar cards (same cards as the menu) |

Everything in a database is published (there's no "show on site" checkbox). All text in Notion is lowercase by Jamie's choice.

## Style rules

- **Everything is a colored-pencil illustration**: shapes drawn with the `piece()` helper and the `#pencil` filter, warm and grainy, matching the house. Flat, crisp, glossy or "UI-looking" elements look wrong. If a pencil-filtered fill lets things show through, put a solid fill underneath.
- Interior: Korean hanok (hanji-cream walls, honey timber, maru floor, stone foundation) with a sage-green gable and a wooden roof edge. The kitchen is stone, walnut and paper lanterns.
- Palette: ink `#4a3a2e`, soft ink `#76614f`, paper `#fbf6ec`, Bordeaux `#561c25`. **All links are Bordeaux maroon `--link: #7a2633`**, never orange.
- Text on any lined index card sits on the ruled lines (the "writing on the lines" snapper handles it).
- Jamie dislikes: black borders and drop shadows on tickets and cards, backgrounds behind illustrations, close buttons where clicking outside works, captions that repeat what the drawing already says, and anything that briefly flashes the wrong look during a transition.
- The menu ("what I'm cooking") and the record player float over the house with no paper behind them, and close when you click outside.
- **Type system (two fonts only)**: the script (La Belle Aurore, always with the `#ink` texture like the logo) and the sans body font (Zen Maru Gothic). No other typefaces, including on the letter page. Sizes are set once, at the end of the stylesheet, as desktop / phone (phone = up to 760px wide, or portrait up to 1100px):
  1. Titles (modal titles, journal entry and project titles): script, 48 / 40px (`--t-title`)
  2. Card titles (project, dish and drink cards, ticket numbers, section headings): script, 32 / 28px (`--t-card`)
  3. Quotes (tickets, pull quotes): sans, 20 / 18px (`--t-quote`)
  4. Body text: sans regular, 20 / 18px (`--t-body`)
  5. Metadata (years, dates, eyebrows, supporting labels): sans, ALL CAPS, 16 / 14px (`--t-meta`)
  6. Buttons, pills, links and input placeholders: sans medium, lowercase (no small caps), 20 / 18px (`--t-btn`)
  New text must use one of these groups; add its selector to the matching rule in that block rather than giving it its own size. Images and videos have no borders and 2px corners.
- Opening anything is immersive: the laptop and journal fill the screen, the close button replaces the menu button, and the logo stays visible. On phones and tablet portrait the house is drawn full length (`setLong`) so moving between spots is one pan. There the scene is painted once as a long strip and the camera is a CSS transform on it (`layoutStrip`, `camTransform`): never change the viewBox or the filters during a move on phones, it causes white flashes and stutter on real devices. When a zoom lands (`toCrisp`) the camera switches to real viewBox rendering so zoomed objects stay sharp with the normal grain; scaling the big strip with a transform alone leaves it pixelated on phones. `toStrip` switches back once the view is home again.
- "Send Me a Letter" (menu, the typewriter on the book stack, and "chat for fun" on About) posts the letter, with an optional name and email, to FormSubmit (`formsubmit.co/ajax/...`), which emails it to Jamie. It never opens the visitor's email app and shows no status text. Jamie chose FormSubmit over Notion; the unused Notion route is still here: the **Letters** database (From, Email, Message, Received) exists on the "Jamie Catt-Koble" page, and `workers/letters-to-notion.js` is a Cloudflare Worker that writes to it. It still needs Jamie to create the Worker (free Cloudflare account, secret `NOTION_TOKEN`); then set `LETTERS_URL` in `index.html` to the Worker's address and letters go to Notion instead of FormSubmit.
- The journal is Jamie's Bordeaux leather notebook. Their charms (a gold J, a gold-and-pearl camera, silver cherries, a silver teardrop with a pearl, a gold croissant) hang in a row on a taupe elastic, **on the front cover only**. There is no jasper/polka-dot pendant: that one isn't theirs.

## Content rules

- Only use content Jamie has supplied (Notion, Substack, their real work). Never invent quotes, favorites, posts or placeholder text.
- Drawings of real things (a favorite product, a book) must match the real item's colors and label.
- Media is always the highest-resolution original. For Substack, use the `substack-post-media.s3.amazonaws.com` original, not the CDN-resized copy; videos come from `/api/v1/video/upload/<id>/src`.

## Checking your work

There's no build step. Preview by serving the folder (for example `python3 -m http.server`) and opening it in a browser. Check desktop and phone widths, day and night (the sun toggles night), and the kitchen (the rooms slide). Content from Notion only appears locally after `npm run sync`, which needs `NOTION_TOKEN` in `.env`.
