import { createClient } from '@/lib/supabase/server'

const BUCKET = 'page-banners'
const IMG_RE = /\.(png|jpe?g|webp|gif|avif)$/i

/**
 * Public URL of the banner image dropped into page-banners/<slug>/ in
 * Supabase Storage, or null if none. Newest image wins, so replacing the
 * photo from the Supabase dashboard just works with no code change.
 * Fails soft (returns null) so a storage hiccup never breaks the page.
 */
export async function getPageBannerUrl(slug: string): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(slug, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
    if (error || !data) return null
    const img = data.find((o) => IMG_RE.test(o.name))
    if (!img) return null
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(`${slug}/${img.name}`)
    return pub?.publicUrl ?? null
  } catch {
    return null
  }
}
