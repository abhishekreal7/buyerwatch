import { describe, expect, it, vi } from 'vitest'
import {
  buildSubredditSearchRssUrl,
  parseRedditRss,
  fetchSubredditSearchWithSource,
} from '../src/lib/reddit'
import { redis } from '../src/lib/redis'

describe('Reddit Search Backfill', () => {
  it('constructs canonical search URLs for specific subreddits and global search', () => {
    expect(buildSubredditSearchRssUrl('Entrepreneur', 'marketing agency')).toBe(
      'https://www.reddit.com/r/entrepreneur/search.rss?q=marketing%20agency&restrict_sr=1&sort=new',
    )
    expect(buildSubredditSearchRssUrl('r/SaaS', 'crm software')).toBe(
      'https://www.reddit.com/r/saas/search.rss?q=crm%20software&restrict_sr=1&sort=new',
    )
    expect(buildSubredditSearchRssUrl('all', 'buyer intent')).toBe(
      'https://www.reddit.com/search.rss?q=buyer%20intent&sort=new',
    )
  })

  it('parses valid search RSS entries for target subreddits', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>t3_search123</id>
    <author><name>/u/founder1</name></author>
    <title>Looking for a good marketing tool</title>
    <link href="https://www.reddit.com/r/entrepreneur/comments/search123/looking_for_tool/" />
    <published>2026-09-01T12:00:00+00:00</published>
    <content type="html">&lt;div class="md"&gt;&lt;p&gt;Need an affordable alternative to HubSpot.&lt;/p&gt;&lt;/div&gt;</content>
  </entry>
</feed>`

    const posts = parseRedditRss(xml, 'entrepreneur')
    expect(posts).toHaveLength(1)
    expect(posts[0].externalId).toBe('search123')
    expect(posts[0].author).toBe('founder1')
    expect(posts[0].title).toBe('Looking for a good marketing tool')
    expect(posts[0].text).toContain('alternative to HubSpot')
    expect(posts[0].url).toBe('https://www.reddit.com/r/entrepreneur/comments/search123/')
  })

  it('parses global search entries across different subreddits when target is all', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>t3_global456</id>
    <author><name>/u/buyer2</name></author>
    <title>Any CRM recommendations?</title>
    <link href="https://www.reddit.com/r/startups/comments/global456/any_crm/" />
    <published>2026-09-02T15:00:00+00:00</published>
    <content type="html">&lt;div class="md"&gt;&lt;p&gt;Comparing pipedrive and close.&lt;/p&gt;&lt;/div&gt;</content>
  </entry>
</feed>`

    const posts = parseRedditRss(xml, 'all')
    expect(posts).toHaveLength(1)
    expect(posts[0].externalId).toBe('global456')
    expect(posts[0].sourceTarget).toBe('startups')
  })

  it('fetches search RSS with cache support', async () => {
    vi.spyOn(redis, 'get').mockResolvedValue(null as never)
    vi.spyOn(redis, 'set').mockResolvedValue('OK' as never)

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>t3_test789</id>
    <author><name>/u/buyer3</name></author>
    <title>Best accounting platform?</title>
    <link href="https://www.reddit.com/r/smallbusiness/comments/test789/accounting/" />
    <published>2026-09-03T10:00:00+00:00</published>
    <content type="html">&lt;div class="md"&gt;&lt;p&gt;Need accounting help for my business.&lt;/p&gt;&lt;/div&gt;</content>
  </entry>
</feed>`

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(xml, {
        status: 200,
        headers: { 'Content-Type': 'application/atom+xml' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchSubredditSearchWithSource('smallbusiness', 'accounting', 25)
    expect(result.source).toBe('rss')
    expect(result.posts).toHaveLength(1)
    expect(result.posts[0].externalId).toBe('test789')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('https://www.reddit.com/r/smallbusiness/search.rss')
  })
})
