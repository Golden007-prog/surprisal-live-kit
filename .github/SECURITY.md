# Security

## Report a problem

Do not open a public issue for a security problem. Use GitHub's private report: open the **Security** tab of this
repository and click **Report a vulnerability**.

We fix security problems on `main`. There are no older versions to support.

## How the app protects a session

- **The database.** Every table has row level security on and no policies. Only the server function can read or
  write, with the Supabase service key. The browser never gets that key.
- **The host.** Going live gives the host a random 24-byte token. The server keeps only its SHA-256 hash. Every host
  action (move a slide, reveal, end, moderate) needs the token.
- **The admin key.** `LIVE_ADMIN_KEY` lets a person go live and change the shared deck library. Phones never need it.
- **Phones.** A person is a random id and the name they type. Every write checks that the id joined the room, so a
  made-up id cannot stuff a poll. The app collects no email addresses.
- **Rate limits.** The function limits requests per IP address and per person. The limits are kept per server
  instance, so they slow abuse but are not a hard wall.
- **The word filter.** It holds answers with listed words until the host approves them. It is a convenience, not a
  guarantee: the host can also hide any answer or question live.

## When you deploy it

- Put `SUPABASE_SERVICE_ROLE_KEY` and `LIVE_ADMIN_KEY` only in the server's environment variables, never in a
  `VITE_` variable.
- Make `LIVE_ADMIN_KEY` long and random (`openssl rand -hex 24`), and change it when a host leaves.
- The console link holds the host token. Do not post it in a chat.
