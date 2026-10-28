/**
 * /api/live — Surprisal Live Kit. Everything is in api/_lib/live.ts; this file picks the store.
 *
 * GET  ?op=state&code=…           the session as every phone sees it (edge-cached 1 s). With the x-live-host header:
 *                                  the host view (deck, results, reactions, held answers, the lobby), uncached.
 * GET  ?op=results&code=…&slide=… self-paced sessions: one slide's results (edge-cached 1 s).
 * GET  ?op=me&code=…&pid=…        one participant's quiz score, rank and streak.
 * GET  ?op=export&code=…          host only: the deck, every result, participants, reactions, the leaderboard, a CSV.
 * GET  ?op=decks                  admin only: the shared deck library.
 * POST ?op=deck-save { id?, deck, by? } / ?op=deck-delete { id }      admin only.
 * POST ?op=create  { deck }       admin only (x-live-admin-key = LIVE_ADMIN_KEY) → { code, hostToken }.
 * POST ?op=join    { code, pid, name }
 * POST ?op=answer  { code, pid, slide, answer }   one answer per person per slide; a quiz answer is final.
 * POST ?op=ask     { code, pid, text }            Q&A, when the deck has a Q&A slide.
 * POST ?op=vote    { code, pid, question, on }
 * POST ?op=react   { code, pid, emoji }
 * POST ?op=control { code, action: goto|accepting|results|timer|end|reopen, index?, on? }   host only.
 * POST ?op=moderate { code, question | entry, answered?, hidden?, approve? }                 host only.
 *
 * Until supabase/migrations/0001_live.sql is applied (and SUPABASE_* are set) every call answers 503 `not_configured`.
 */
import { json, SUPABASE_URL, SERVICE_KEY } from './_lib/http.js'
import { handleLive, supabaseStore } from './_lib/live.js'

async function handler(req: Request): Promise<Response> {
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'not_configured' }, 503)
  try {
    return await handleLive(req, supabaseStore(SUPABASE_URL, SERVICE_KEY), { adminKey: process.env.LIVE_ADMIN_KEY })
  } catch (e) {
    // A missing table (the migration not applied) lands here as a PostgREST 404.
    console.error('live', e)
    return json({ error: 'unavailable' }, 503)
  }
}

// Vercel's Node runtime passes a Web Request only to a `fetch` export; a bare default function gets (req, res).
export default { fetch: handler }
