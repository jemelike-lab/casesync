import type { MetadataRoute } from 'next'

/**
 * robots.txt — the pre-launch review flagged an invalid robots.txt (the 404
 * page was being served in its place). CaseSync is an internal PHI system:
 * nothing should be indexed.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  }
}
