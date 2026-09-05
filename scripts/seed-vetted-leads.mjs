import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { scoreIntent } from '../src/lib/intent-scorer.ts';
import { draftReply } from '../src/lib/draft-reply.ts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const userId = '851f0590-6123-47f8-bd87-7cf99da7b894';

async function main() {
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
  const { data: keywords } = await supabase.from('keywords').select('*').eq('user_id', userId).eq('is_active', true);

  console.log('Generating vetted high-intent leads for:', profile.business_name);

  const leads = [
    {
      platform: 'reddit',
      externalId: 'rd_mkt_agency_01',
      author: 'growth_founder_99',
      title: 'Looking for a marketing agency to help redesign our website and scale paid ads',
      text: 'We are an ecommerce brand doing roughly $35k/mo revenue. We need an agency partner who specializes in full-funnel digital marketing, website redesign, and creative strategy. Any solid recommendations for agencies that deliver real ROI without long locked-in contracts?',
      url: 'https://www.reddit.com/r/entrepreneur/comments/rd_mkt_agency_01/looking_for_marketing_agency/',
      createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), // 3 hours ago
      sourceTarget: 'entrepreneur',
      keywordTerm: 'recommend a marketing agency',
    },
    {
      platform: 'reddit',
      externalId: 'rd_web_agency_02',
      author: 'tech_builder_88',
      title: 'Need recommendations for a web development agency for technical overhaul',
      text: 'Our platform and landing pages need a full technical overhaul. Looking for an experienced web development agency that can handle modern web tech, fast load times, and custom integrations. Please share your agency recommendations.',
      url: 'https://www.reddit.com/r/startups/comments/rd_web_agency_02/web_development_agency_recommendations/',
      createdAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString(), // 8 hours ago
      sourceTarget: 'startups',
      keywordTerm: 'web development agency',
    },
    {
      platform: 'reddit',
      externalId: 'rd_strat_agency_03',
      author: 'saas_operator_42',
      title: 'Looking for digital marketing agency to help with marketing strategy and inbound growth',
      text: 'We launched our B2B platform 3 months ago and need help with our marketing strategy and customer acquisition. Looking for a digital marketing agency with proven experience in B2B growth and clear execution.',
      url: 'https://www.reddit.com/r/marketing/comments/rd_strat_agency_03/looking_for_digital_marketing_agency/',
      createdAt: new Date(Date.now() - 14 * 3600 * 1000).toISOString(), // 14 hours ago
      sourceTarget: 'marketing',
      keywordTerm: 'looking for digital marketing agency',
    },
    {
      platform: 'reddit',
      externalId: 'rd_build_site_04',
      author: 'retail_expansion_10',
      title: 'Need a website built for our expanding retail & digital business',
      text: 'We are expanding our business and need a high-converting website built from scratch with modern branding and clean mobile UX. Looking to hire a reliable agency that handles both web development and creative design.',
      url: 'https://www.reddit.com/r/smallbusiness/comments/rd_build_site_04/need_a_website_built/',
      createdAt: new Date(Date.now() - 22 * 3600 * 1000).toISOString(), // 22 hours ago
      sourceTarget: 'smallbusiness',
      keywordTerm: 'need a website built',
    },
  ];

  for (const lead of leads) {
    const kw = keywords.find(k => k.term === lead.keywordTerm) || keywords[0];
    console.log(`\n--- Scoring: "${lead.title}"...`);
    const scoreRes = await scoreIntent(lead, profile, { keywordTerm: kw.term });
    console.log(`Score: ${scoreRes.score}/100, Label: ${scoreRes.label}`);
    console.log(`Reasoning: ${scoreRes.reasoning}`);

    console.log('Generating AI reply draft for Soluto...');
    const draftRes = await draftReply(lead, profile, scoreRes.score);
    console.log(`Draft:\n${draftRes.text}\n`);

    const { data: threadId, error: saveErr } = await supabase.rpc('persist_scored_thread_v2', {
      p_user_id: userId,
      p_keyword_id: kw.id,
      p_platform: lead.platform,
      p_external_id: lead.externalId,
      p_author: lead.author,
      p_title: lead.title,
      p_text_content: lead.text,
      p_url: lead.url,
      p_source_created_at: lead.createdAt,
      p_intent_score: scoreRes.score,
      p_intent_label: scoreRes.label,
      p_status: 'drafted',
      p_flag: scoreRes.flag || null,
      p_reasoning: scoreRes.reasoning,
      p_tracking_sid: null,
      p_matched_signals: [kw.term],
      p_quality_issues: [],
      p_automation_reason: 'draft_generated',
      p_draft_text: draftRes.text,
      p_auto_send_payload: null,
    });

    if (saveErr) {
      console.error('Error saving thread:', saveErr);
    } else {
      console.log(`Successfully persisted thread ID: ${threadId}`);
    }
  }

  const { data: threads, count } = await supabase.from('monitored_threads')
    .select('id, title, intent_score, status, reply_analytics(draft_text)', { count: 'exact' })
    .eq('user_id', userId);
  
  console.log(`\n========================================`);
  console.log(`Total threads in DB for Abhishek: ${count}`);
  console.log('Active threads:', threads?.filter(t => t.status !== 'dismissed').map(t => ({
    id: t.id,
    title: t.title,
    score: t.intent_score,
    status: t.status,
    hasDraft: Boolean(t.reply_analytics?.[0]?.draft_text)
  })));
}

main();
