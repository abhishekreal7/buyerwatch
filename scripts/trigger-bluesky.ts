import { blueskyFetchHandler } from '../worker/handlers/fetch-bluesky.js';

async function run() {
  console.log('Manually fetching Bluesky for #buildinpublic...');
  await blueskyFetchHandler({ data: { target: '#buildinpublic' } } as any);
  
  console.log('Manually fetching Bluesky for #saas...');
  await blueskyFetchHandler({ data: { target: '#saas' } } as any);
  
  console.log('Fetches completed. Check the dashboard!');
  process.exit(0);
}

run();
