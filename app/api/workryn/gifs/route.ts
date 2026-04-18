import { NextRequest, NextResponse } from 'next/server'

// Tenor API (Google) - TENOR_KEY is a working public API key for development
const TENOR_KEY = process.env.TENOR_API_KEY ?? 'AIzaSyAyimkuYQYF_FXVALexPzpAGBNu-DNnPaY'
const LIMIT = 9

const FALLBACK_GIFS = [
  { id: 'fb1', url: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyY/giphy.gif', title: 'Thumbs Up' },
  { id: 'fb2', url: 'https://media.giphy.com/media/l0HlHFRbmaZtBRhXG/giphy.gif', title: 'High Five' },
  { id: 'fb3', url: 'https://media.giphy.com/media/KJ1f5iTl4Oo7u/giphy.gif', title: 'Laughing' },
  { id: 'fb4', url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif', title: 'Working Hard' },
  { id: 'fb5', url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif', title: 'Mind Blown' },
  { id: 'fb6', url: 'https://media.giphy.com/media/3ohzdIuqJoo8QdKlnW/giphy.gif', title: 'Yes!' },
  { id: 'fb7', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', title: 'Excited' },
  { id: 'fb8', url: 'https://media.giphy.com/media/xT9IgG50Lg7rushjS4/giphy.gif', title: 'Party' },
  { id: 'fb9', url: 'https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif', title: 'Awesome' },
]

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''

  try {
    // Tenor v2 API
    const endpoint = q.trim()
      ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&limit=${LIMIT}&media_filter=gif`
      : `https://tenor.googleapis.com/v2/featured?key=${TENOR_KEY}&limit=${LIMIT}&media_filter=gif`

    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(6000),
    })

    if (!response.ok) {
      console.error('Tenor API error:', response.status)
      return NextResponse.json(FALLBACK_GIFS)
    }

    const json = await response.json()

    if (!Array.isArray(json?.results)) {
      return NextResponse.json(FALLBACK_GIFS)
    }

    const gifs = json.results.map((g: any) => {
      // Tenor v2 media_formats structure
      const formats = g.media_formats ?? {}
      const url =
        formats.tinygif?.url ??
        formats.gif?.url ??
        formats.nanogif?.url ??
        null
      return { id: g.id, url, title: g.content_description ?? '' }
    }).filter((g: any) => Boolean(g.url))

    return NextResponse.json(gifs.length > 0 ? gifs : FALLBACK_GIFS)
  } catch (err) {
    console.error('GIF fetch failed:', err)
    return NextResponse.json(FALLBACK_GIFS)
  }
}
