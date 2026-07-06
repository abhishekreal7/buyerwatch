import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Link,
  Hr
} from '@react-email/components'
import * as React from 'react'

interface Opportunity {
  platform: string
  external_id: string
  text_content: string
  url: string | null
  intent_score: number
}

interface WeeklyDigestProps {
  opportunities: Opportunity[]
  totalFound: number
  totalDrafts: number
  totalReplies: number
  dashboardUrl: string
}

export const WeeklyDigest = ({
  opportunities = [],
  totalFound = 0,
  totalDrafts = 0,
  totalReplies = 0,
  dashboardUrl = 'https://scouto.com/dashboard'
}: WeeklyDigestProps) => (
  <Html>
    <Head />
    <Preview>{`Your weekly Scouto digest: We found ${totalFound} opportunities for you.`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your Week with Scouto</Heading>
        
        <Text style={text}>
          Here's a quick summary of what we've been up to in the background:
        </Text>

        <Section style={statsBox}>
          <Text style={statRow}>
            <strong>Conversations Found:</strong> {totalFound} (People actively looking for what you sell)
          </Text>
          <Text style={statRow}>
            <strong>Drafts Ready for Review:</strong> {totalDrafts}
          </Text>
          <Text style={statRow}>
            <strong>Replies Sent:</strong> {totalReplies}
          </Text>
        </Section>

        {opportunities.length > 0 && (
          <>
            <Heading style={h2}>Top Opportunities This Week</Heading>
            {opportunities.map((opp, index) => (
              <Section key={index} style={oppCard}>
                <Text style={oppPlatform}>
                  {opp.platform === 'reddit' ? 'Reddit' : 'Bluesky'} (Score: {opp.intent_score})
                </Text>
                <Text style={oppContent}>
                  "{opp.text_content.length > 150 ? opp.text_content.substring(0, 150) + '...' : opp.text_content}"
                </Text>
                {opp.url && (
                  <Link href={opp.url} style={link}>View original post →</Link>
                )}
              </Section>
            ))}
          </>
        )}

        <Section style={btnContainer}>
          <Link href={dashboardUrl} style={button}>
            Review Your Dashboard
          </Link>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>
          You are receiving this because you enabled Weekly Reports in Scouto Settings.
        </Text>
      </Container>
    </Body>
  </Html>
)

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 20px',
  borderRadius: '8px',
  boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
  maxWidth: '600px',
}

const h1 = {
  color: '#1d1d1f',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0 0 20px',
}

const h2 = {
  color: '#1d1d1f',
  fontSize: '18px',
  fontWeight: '600',
  margin: '30px 0 15px',
}

const text = {
  color: '#52525b',
  fontSize: '15px',
  lineHeight: '24px',
}

const statsBox = {
  backgroundColor: '#f4f4f5',
  padding: '20px',
  borderRadius: '8px',
  margin: '20px 0',
}

const statRow = {
  margin: '0 0 10px',
  color: '#27272a',
  fontSize: '14px',
}

const oppCard = {
  borderLeft: '4px solid #0A84FF',
  padding: '15px 20px',
  backgroundColor: '#f8fafc',
  marginBottom: '15px',
  borderRadius: '0 8px 8px 0',
}

const oppPlatform = {
  fontSize: '12px',
  color: '#64748b',
  fontWeight: 'bold',
  textTransform: 'uppercase' as const,
  margin: '0 0 8px',
}

const oppContent = {
  fontSize: '14px',
  color: '#334155',
  margin: '0 0 10px',
  lineHeight: '20px',
  fontStyle: 'italic',
}

const link = {
  color: '#0A84FF',
  fontSize: '13px',
  textDecoration: 'none',
  fontWeight: '600',
}

const btnContainer = {
  textAlign: 'center' as const,
  margin: '30px 0',
}

const button = {
  backgroundColor: '#0A84FF',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '15px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
}

const hr = {
  borderColor: '#e5e7eb',
  margin: '30px 0 20px',
}

const footer = {
  color: '#94a3b8',
  fontSize: '12px',
  textAlign: 'center' as const,
}

export default WeeklyDigest
