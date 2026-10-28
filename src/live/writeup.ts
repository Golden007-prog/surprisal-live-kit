/** The report's data, and the session's answers written up as Markdown to paste into a follow-up. */
import { isFlagged, type Deck, type Results, type Slide } from '../lib/live'

export type Export = {
  code: string
  title: string
  created_at: string
  phase: string
  deck: Deck
  results: { slide: Slide; results: Results | null }[]
  answers: number[]
  participants: { total: number; names: string[] }
  reactions: Record<string, number>
  leaderboard: { name: string; score: number; correct: number }[]
  csv: string
}

/**
 * The write-up, ready to paste: the top words of every word cloud and the open answers, as Markdown. Anything the
 * word filter flags stays out, even when the host let it onto the screen: a follow-up email is print.
 */
export function writeupMarkdown(r: Export): string {
  const date = new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const out = [`## ${r.title}: what surprised the room`, '', `*${r.participants.total} people, ${date}.*`, '']
  for (const { slide, results } of r.results) {
    if (results?.kind === 'words' && results.words.length) {
      out.push(`**${slide.title}**`, '', results.words.filter((w) => !isFlagged(w.text)).slice(0, 12).map((w) => (w.count > 1 ? `${w.text} (${w.count})` : w.text)).join(' · '), '')
    }
    if (results?.kind === 'open' && results.entries.length) {
      out.push(`**${slide.title}**`, '')
      for (const e of results.entries.filter((x) => !isFlagged(x.text)).slice(0, 6)) out.push(`> ${e.text}`, '')
    }
    if (results?.kind === 'number' && slide.kind === 'number' && slide.answer != null && results.total)
      out.push(`**${slide.title}** The room guessed ${results.median}${slide.unit ? ` ${slide.unit}` : ''} (median). The truth: ${slide.answer}${slide.unit ? ` ${slide.unit}` : ''}.`, '')
  }
  return out.join('\n').trim() + '\n'
}

