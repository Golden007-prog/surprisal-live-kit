# Contributing

Thank you for helping. Bug reports, fixes, new slide types and more languages for the word filter are all welcome.

## Ways to help

- **Report a bug.** Open an issue with the bug template. Say what you did, what you expected and what happened.
  A screenshot of the presenter and the phone helps a lot.
- **Fix a known issue.** The list is in the README under [Roadmap and known issues](/README.md#roadmap-and-known-issues).
- **Suggest a slide type or a feature.** Open an issue with the feature template before you write the code, so we can
  agree on the shape first.
- **Add words to the filter.** The list is `FLAGGED` in [`src/lib/deck.ts`](/src/lib/deck.ts). Add whole words only,
  and say which language each one is from.

## Set it up

You need Node.js 20.19 or later.

```sh
npm install
npm run dev     # the app, with an in-memory store, at the Network address + /live/host
npm run demo    # in a second terminal: a room with every slide type and 32 sample people
```

## Before you open a pull request

Run the three checks. GitHub Actions runs the same ones on every pull request.

```sh
npm test                         # the server logic, in memory
npm run build                    # type check and production build
npx playwright install chromium  # once
npm run smoke                    # one whole session in a real browser
```

If you change what the screen or the phone shows, add a screenshot of the presenter and of the phone to the pull
request. Check both light and dark.

## Where the code is

| Path | What it holds |
|---|---|
| [`api/_lib/live.ts`](/api/_lib/live.ts) | All the server logic: one handler, an in-memory store and a Supabase store |
| [`api/_lib/live.test.ts`](/api/_lib/live.test.ts) | The server tests (vitest, in-memory store) |
| [`src/lib/deck.ts`](/src/lib/deck.ts) | Deck types, the deck cleaner, results maths, templates and the word filter. The server and the client share it. |
| [`src/screens/`](/src/screens) | One file per screen: `Phone`, `Host` (library), `Editor`, `Presenter`, `Console`, `Report` |
| [`src/components/`](/src/components) | The parts the screens share: `Stage` (the slide), `Results` (every chart), `Qr`, `CountUp` |
| [`src/motion/`](/src/motion) | Animation and sound: the bar race, impact effects, the word cloud's layout and physics |
| [`src/lib/`](/src/lib) | The browser's calls to the server, what the host's pages remember, the report write-up |
| [`src/styles/`](/src/styles) | `theme.css` (colours and fonts), `app.css` (every screen), `lobby.css` (the name pile) |
| [`src/brand.tsx`](/src/brand.tsx) | The name, logo and link, read from `.env` |
| [`index.html`](/index.html), [`host.html`](/host.html) | The two pages: the phone and the host |
| [`supabase/migrations/`](/supabase/migrations) | The database |
| [`scripts/`](/scripts) | `smoke.mjs` (the browser check), `demo.mjs` (the sample room), `screenshots.mjs` (the README images) |

## Add a slide type

A slide type touches these places. Use an existing type of the same shape as your guide.

1. The type and its fields in `src/lib/deck.ts`, and its case in `cleanDeck`.
2. Its answer check and its results in `src/lib/deck.ts`.
3. Tests in `api/_lib/live.test.ts`: a good answer, a bad answer and the results.
4. The phone's input in `src/screens/Phone.tsx`.
5. The screen's results in `src/components/Results.tsx`.
6. The editor's fields in `src/screens/Editor.tsx`.
7. A slide in `scripts/demo.mjs`, with answers, so everyone can see it.

## Style

- Match the file you edit: its naming, its comments and its idioms.
- TypeScript is strict. Do not add `any`.
- Do not add a dependency unless the change cannot be made without one. Say why in the pull request.
- Keep the server logic free of Supabase details. The tests run it on the in-memory store.
- Use [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`.

## License

By contributing, you agree that your contribution is licensed under the [MIT License](/LICENSE).
