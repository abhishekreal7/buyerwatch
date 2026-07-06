import { searchBlueskyPosts } from '../src/lib/bluesky.js';
import { scorePostQueue } from '../src/lib/queues/index.js';

async function run() {
  console.log('Manually fetching Bluesky for #tech...');
  try {
    const posts = await searchBlueskyPosts('#tech');
    let matched = 0;
    for (const p of posts) {
       if (p.text.toLowerCase().includes('startup') || matched === 0) {
          matched++;
          p.text = 'I am desperately looking for a new tool to help me generate leads automatically for my startup! Does anyone have a recommendation for an AI tool that can find leads on social media?';
          p.externalId = p.externalId + '-high-intent';
          const safeJobId = p.externalId.replace(/:/g, '_');
          await scorePostQueue.add('score', {
            userId: '64badee2-2bfe-4c84-8346-ab997e83c811',
            keywordId: '93afb5b9-4d66-4c35-81ca-450ba44a27fb',
            post: p,
          }, {
            jobId: `score-mock-${safeJobId}`
          });
          console.log('Enqueued mock post to scorePostQueue');
       }
    }
    console.log('Fetch completed. Check the database or dashboard for new leads.');
    process.exit(0);
  } catch (error) {
    console.error('Error fetching:', error);
  }
}

run();
