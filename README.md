# Surprisal Live Kit

Polls, word clouds, quizzes, reactions and Q&A for live sessions. You share the presenter screen in a call or on a
projector. People join on their phone with a 4-letter code or the QR code. Nobody needs an account or an app.

It is the app that [Surprisal](https://surprisal.to) runs its member sessions and webinars on, without the Surprisal
brand. You set your own name, logo and colours.

- **12 slide types:** content, poll, word cloud, open text, scale (1 to 5, 1 to 10, agree / disagree), ranking,
  100 points, prediction (guess a number, then reveal the truth), 2×2, quiz (timed, with points and a podium),
  leaderboard and Q&A (with upvotes).
- **Results stay hidden until you reveal them.** The screen counts the answers as they arrive. Open answers show as
  face-down cards. Press **Reveal results** or the R key.
- **Reactions:** 👏 🤯 😂 ❤️ 🤔. They rise on the screen. The phone confirms each one.
- **Doors open:** the first slide shows the QR code and the join code. Each name that joins falls onto a pile of cards.
- **A console for the host:** notes, the next slide, held answers and every control, in a second window or on your
  phone. The room does not see it.
- **A word filter:** answers with swear words or slurs (English, Swedish, Portuguese) wait in the console until you
  approve them.
- **Self-paced decks** for surveys before or after a session.
- **A report** after each session, with a CSV and JSON export and a Markdown write-up to paste into a follow-up.
- **Light and dark**, keyboard shortcuts, sound for the quiz (off by default).

## Try it on your computer

You need [Node.js](https://nodejs.org) 20.19 or later. You do not need any accounts.

```sh
git clone https://github.com/habit-ai/surprisal-live-kit.git
cd surprisal-live-kit
npm install
npm run dev
```

1. Open the **Network** address that the terminal shows, plus `/live/host`. For example: `http://192.168.1.20:5173/live/host`.
2. Click a template, then click **Go live**.
3. Scan the QR code with a phone on the same Wi-Fi network.

Use the Network address, not `localhost`. The QR code points to the address in your browser, and a phone cannot open
`localhost` on your computer.

The local server keeps everything in memory. A restart deletes all sessions. Anyone who can open the page can go live.
For a real session with people in other places, deploy it (below).

## Deploy it (Vercel and Supabase, both have free plans)

### 1. Make the database

1. Make a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**. Paste all of [`supabase/migrations/0001_live.sql`](supabase/migrations/0001_live.sql). Click **Run**.
3. Open **Project Settings > API**. Copy the **Project URL** and the **service_role** key.

The tables have row level security on and no policies. Only the server function can read or write them, with the
service key. Do not put the service key in the browser or in a `VITE_` variable.

### 2. Deploy the app

1. Push this repository to your own GitHub account.
2. At [vercel.com](https://vercel.com), click **Add New > Project** and import the repository. Vercel finds the Vite settings.
3. Add these environment variables before the first deploy:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | The Project URL from step 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | The service_role key from step 1 |
   | `LIVE_ADMIN_KEY` | A long random string. Make one with `openssl rand -hex 24`. |

4. Click **Deploy**.
5. Open `https://your-app.vercel.app/live/host`. Click **Connect shared library** and type your `LIVE_ADMIN_KEY`.

Each host types the admin key once per browser. The key lets them go live and share decks in the library. Give it
only to people who host. Phones never need it.

### 3. Put the server near the database

`vercel.json` runs the function in London (`lhr1`), next to a Supabase project in `eu-west-2`. If your Supabase project
is in another region, change `regions` to the nearest [Vercel region](https://vercel.com/docs/edge-network/regions).
Every answer is a round trip from the function to the database, so this changes how fast the screen updates.

## Make it yours

Brand settings are environment variables. Vite reads them at build time, so redeploy after a change. For a local
build, copy `.env.example` to `.env`.

| Name | What it does | Default |
|---|---|---|
| `VITE_BRAND_NAME` | Your name in the top bars, the browser tab and the report | `Live` |
| `VITE_BRAND_LOGO` | A file in `public/` or a full URL. Set it to an empty value to show the name only. | `/logo.svg` |
| `VITE_BRAND_URL` | Where the phone's last screen links to | no link |
| `VITE_JOIN_HOST` | The address the screen shows for phones, for example `live.example.org` | the site's own address |

Colours and fonts are in [`src/styles/theme.css`](src/styles/theme.css). The comment at the top of that file lists
the tokens to change first. Change the dark values too, and keep text at a contrast of 4.5:1 or more.

- A one-colour logo turns white in dark mode. For a colour logo, set `--brand-logo-dark-filter: none` in `theme.css`.
- Replace `public/favicon.svg` with your own icon.
- The templates on the host page are in `TEMPLATES` in [`src/lib/live.ts`](src/lib/live.ts).
- The word filter's list is `FLAGGED` in the same file.

## Run a session

1. Make a deck on the host page, or start from a template. Click **Go live**.
2. Share the presenter window in your call, or put it on the projector. Keep the window uncovered: a hidden tab stops updating.
3. Press **C** to open the console in a second window. To run the session from your phone, scan the console's QR code.
   That link gives full host control, so do not post it in a chat.
4. Move between slides with the arrow keys. Press **R** to reveal or hide results.
5. After the session, press **End**, then open the **Report**. The report also opens later from the host page.

| Key | Action |
|---|---|
| → / ← (or Page Down / Page Up, Space) | Next / previous slide |
| R | Reveal or hide the results |
| V | Open or close voting |
| T | Restart the slide's timer |
| J | Show the join code full screen |
| C | Open the console |
| F | Full screen |
| S | Sound on or off |
| Esc | Close an overlay |

The host key for each session is kept in the browser that made it. To present from another browser, open the
console's link (its QR code) there.

## Check that it works

```sh
npm test                        # 32 tests on the server logic, in memory
npx playwright install chromium # once
npm run smoke                   # one whole session in a real browser: host, phone, poll, reveal, reaction, end
npm run build                   # type check and production build
```

On surprisal.to, this code ran a load test with 45 phones at a normal pace and 150 phones that all answered within
2 seconds. No answers were lost. The 95th percentile was 288 ms for an answer and 150 ms for a room poll.

## Good to know

- Phones poll the server every 1.2 s. The presenter polls every 0.9 s. There are no websockets to keep open.
- The rate limits are kept per server instance, so they slow abuse but are not a hard wall.
- People are a random id on the phone plus the name they type. The app does not collect email addresses.
- Two hand-over links opened at the same moment in one browser can drop one session from the host page's list.
  Open them one at a time.
- A session opened from a hand-over link shows as "Live session" on the host page, not with its deck title.
- At window sizes of 1440×790 or less, a 6-option poll and the prediction chart can run under the bottom bar.

## License

MIT. See [LICENSE](LICENSE). Made by [Surprisal](https://surprisal.to). If you run it for your community, we would
like to hear about it.
