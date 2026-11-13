# Jamie & Teo's House

My illustrated tiny-house portfolio. Quotes, monthly favorites and what I'm cooking come from Notion. Journal posts come from Substack.

## Content from Notion

Notion is the only place this content lives. My databases on the [Jamie Catt-Koble page](https://app.notion.com/p/jamiecatt/Jamie-Catt-Koble-4176e746316580819cf2fc6a92db4a56) feed the site:

| Notion database | Shows up as |
|---|---|
| **Quotes** | tickets from the ticket machine |
| **Favorite** | "Monthly faves" in the menu, and favorite tickets |
| **On The Menu** | "What I'm cooking" (the pan, or the menu) |

Every row is published, newest first. To take something off the site, delete it in Notion.

**How it gets to the site.** The site can't read Notion directly from the browser, because that would expose the Notion token to every visitor. Instead, every time the site is published, `.github/workflows/deploy.yml` runs `npm run sync`, which reads Notion with the token stored in GitHub's secrets, writes `data/*.json` and `assets/notion/`, and publishes them with the site. Those files are made fresh on each deploy and are never committed.

The site republishes every hour, whenever I push, and after the Substack sync runs. To see a Notion change right away: repo → **Actions** → **Deploy site** → **Run workflow**.

If Notion can't be read (wrong token, database not shared), the deploy stops and the last published site stays up.

### One-time setup

1. **Create the Notion connection.**
   1. Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations) and click **New integration**.
   2. Name it something like "Website sync", pick my workspace, and leave the type as **Internal**.
   3. Under **Capabilities**, keep only **Read content** checked. The site never writes to Notion.
   4. Save, then copy the **Internal Integration Secret**. It starts with `ntn_`. This is the token.

2. **Share the databases with the connection.** Open the "Jamie Catt-Koble" page, click **•••** (top right) → **Connections** → **Connect to** → choose "Website sync". That covers all three databases inside it.

3. **Add the secrets to GitHub.** In the repo: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Add these four:

   | Name | Value |
   |---|---|
   | `NOTION_TOKEN` | the token from step 1 |
   | `NOTION_QUOTES_DB` | `4176e7463165808cb1ebc88caf971a90` |
   | `NOTION_FAVES_DB` | `4176e7463165806284c9e8ea8825805c` |
   | `NOTION_COOKING_DB` | `4176e7463165803aa174eaf587d2b804` |

4. **Let Actions publish the site.** **Settings** → **Pages** → under **Build and deployment**, set **Source** to **GitHub Actions**.

5. Push, or run **Deploy site** from the Actions tab.

### Notion properties the site reads

The exact names matter. Blank fields are simply left out on the site.

- **Quotes:** `Quote` (title), `Author` (text), `Source` (text; a link typed into it is used too), `Author link` (URL), `Source link` (URL).
- **Favorite:** `Item` (title), `Month` (select, like "November"), `Year` (select, like "2026"), `Link` (URL), `Description` (text), `Image` (files & media), `Art` (select: book, lotion, balm, tea, coffee, candle or scent; picks the drawing), `Color` (text, like `#e3b29a`; tints the drawing). Without an Image, the page cover is used.
- **On The Menu:** `Dish` (title), `Date` (date; shows the weekday), `Note` (text), `Image` (files & media), `Art` (select: quesadilla, chili-chicken, rice or cottage-peaches; picks the drawing). If Art is blank, a dish whose name matches one of my drawings still gets it; otherwise its Image, then the page cover, then a plain plate.

Images are downloaded at full size into `assets/notion/`, because Notion's own image links expire after about an hour.

## Journal posts from Substack

New posts from [jamiecatt.substack.com](https://jamiecatt.substack.com) are added to `posts.json` automatically every 30 minutes by `.github/workflows/sync-substack.yml`, with full-size photos and videos in `media/posts/`. To run it by hand: `python3 scripts/sync-substack.py`.

## Previewing locally

```
python3 -m http.server 8765
```

Then open http://localhost:8765. Without Notion content, the tickets, faves and menu show a friendly "out of reach" note. To preview them with real content, install [Node.js](https://nodejs.org), copy `.env.example` to `.env`, paste in the token, and run `npm run sync` first. `.env`, `data/` and `assets/notion/` are in `.gitignore`, so none of it gets committed.
