/** Small helpers for the API route. */

export const SUPABASE_URL = process.env.SUPABASE_URL
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

// Per instance: each serverless instance keeps its own window, so the limit is a brake, not a wall.
const HITS = new Map<string, number[]>()
export function rateLimited(ip: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now()
  const recent = (HITS.get(ip) ?? []).filter((t) => now - t < windowMs)
  recent.push(now)
  HITS.set(ip, recent)
  return recent.length > max
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
