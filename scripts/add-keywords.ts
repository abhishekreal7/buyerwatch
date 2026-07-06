import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const userId = '64badee2-2bfe-4c84-8346-ab997e83c811'; // User's ID
  
  const keywordsToInsert = [
    { user_id: userId, platform: 'reddit', target: 'SaaS', term: 'lead generation', is_active: true },
    { user_id: userId, platform: 'reddit', target: 'SaaS', term: 'cold email', is_active: true },
    { user_id: userId, platform: 'reddit', target: 'Entrepreneur', term: 'find customers', is_active: true },
    { user_id: userId, platform: 'reddit', target: 'Entrepreneur', term: 'sales', is_active: true },
    { user_id: userId, platform: 'reddit', target: 'marketing', term: 'b2b leads', is_active: true },
    { user_id: userId, platform: 'bluesky', target: '#buildinpublic', term: 'marketing', is_active: true },
    { user_id: userId, platform: 'bluesky', target: '#saas', term: 'sales', is_active: true }
  ];

  const { data, error } = await supabase
    .from('keywords')
    .insert(keywordsToInsert)
    .select();

  if (error) {
    console.error('Error inserting keywords:', error);
  } else {
    console.log(`Successfully added ${data.length} keywords!`);
  }
}
run();
