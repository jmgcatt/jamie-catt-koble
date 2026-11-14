# Jamie & Teo's House: notes for Claude

Jamie Catt-Koble's portfolio: an interactive, colored-pencil illustration of their tiny house with their tri-color Maltipoo, Teo. Jamie is a designer, illustrator and writer, and edits this site by chatting with Claude, often from their phone. They don't code, so do the whole job: make the change, check it, and ship it when asked.

## How Jamie works with you

- **"Ship it" / deploy / push / merge** means: commit everything to `main` with a short, plain message, push, watch the **Deploy site** GitHub Action until it finishes, check the live site, and fix anything that broke. Don't ask Jamie to run commands or use GitHub Desktop. Don't push unless Jamie asks.
- If you're working on a branch (cloud sessions often are), shipping means getting the change onto `main`: merge the branch or pull request yourself.
- Jamie reviews visually. Describe changes in terms of what they'll see, not code. Small, careful tweaks: don't redesign things they didn't mention.
- Jamie often sends follow-up requests while you're working. Fold them into the current work.

## What's here

- `index.html`: the whole site: one SVG scene plus all the sheets (modals), styles and scripts. **Write it ASCII-only**: escape anything else as `\uXXXX` in JS, or as HTML entities.
- `posts.json`, `media/posts/`: journal posts from Substack, added every 30 minutes by `.github/workflows/sync-substack.yml` (`scripts/sync-substack.py`).
- `scripts/sync-notion.js`: `npm run sync` turns Jamie's Notion databases into `data/*.json` and `assets/notion/`. Those are **built on every deploy and never committed** (they're in `.gitignore`).
- `.github/workflows/deploy.yml`: runs the Notion sync and publishes to GitHub Pages on every push to `main`, every hour, and after each Substack sync. The only secret is `NOTION_TOKEN`; the database IDs are in the workflow.
- Live site: https://jamie-catt.com (DNS at Squarespace, pointing to GitHub Pages).

## Notion (the "Jamie Catt-Koble" page)

| Database | Columns the site reads | Shows up as |
|---|---|---|
| Quotes | Quote, Author, Source, Author link, Source link | "quote" tickets |
| Favorites | Item, Month, Year, Link, Description, Image, Art, Color | "favorite" tickets and Monthly faves |
| Reads | Book Title, Author, Description, Goodreads (optional) | "read" tickets; Goodreads link and cover found automatically via Open Library |
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
- The journal is Jamie's Bordeaux leather notebook. Their charms (a gold J, a gold-and-pearl camera, silver cherries, a silver teardrop with a pearl, a gold croissant) hang in a row on a taupe elastic, **on the front cover only**. There is no jasper/polka-dot pendant: that one isn't theirs.

## Content rules

- Only use content Jamie has supplied (Notion, Substack, their real work). Never invent quotes, favorites, posts or placeholder text.
- Drawings of real things (a favorite product, a book) must match the real item's colors and label.
- Media is always the highest-resolution original. For Substack, use the `substack-post-media.s3.amazonaws.com` original, not the CDN-resized copy; videos come from `/api/v1/video/upload/<id>/src`.

## Checking your work

There's no build step. Preview by serving the folder (for example `python3 -m http.server`) and opening it in a browser. Check desktop and phone widths, day and night (the sun toggles night), and the kitchen (the rooms slide). Content from Notion only appears locally after `npm run sync`, which needs `NOTION_TOKEN` in `.env`.
