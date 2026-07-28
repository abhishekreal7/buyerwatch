"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeeklyDigest = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const WeeklyDigest = ({ opportunities = [], totalFound = 0, totalDrafts = 0, totalReplies = 0, dashboardUrl = 'https://app.example.com/dashboard', unsubscribeUrl, }) => ((0, jsx_runtime_1.jsxs)(components_1.Html, { children: [(0, jsx_runtime_1.jsx)(components_1.Head, {}), (0, jsx_runtime_1.jsx)(components_1.Preview, { children: `Your weekly BuyerWatch digest: We found ${totalFound} opportunities for you.` }), (0, jsx_runtime_1.jsx)(components_1.Body, { style: main, children: (0, jsx_runtime_1.jsxs)(components_1.Container, { style: container, children: [(0, jsx_runtime_1.jsx)(components_1.Heading, { style: h1, children: "Your Week with BuyerWatch" }), (0, jsx_runtime_1.jsx)(components_1.Text, { style: text, children: "Here's a quick summary of what we've been up to in the background:" }), (0, jsx_runtime_1.jsxs)(components_1.Section, { style: statsBox, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { style: statRow, children: [(0, jsx_runtime_1.jsx)("strong", { children: "Conversations Found:" }), " ", totalFound, " (People actively looking for what you sell)"] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { style: statRow, children: [(0, jsx_runtime_1.jsx)("strong", { children: "Drafts Ready for Review:" }), " ", totalDrafts] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { style: statRow, children: [(0, jsx_runtime_1.jsx)("strong", { children: "Replies Sent:" }), " ", totalReplies] })] }), opportunities.length > 0 && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(components_1.Heading, { style: h2, children: "Top Opportunities This Week" }), opportunities.map((opp, index) => ((0, jsx_runtime_1.jsxs)(components_1.Section, { style: oppCard, children: [(0, jsx_runtime_1.jsxs)(components_1.Text, { style: oppPlatform, children: [opp.platform === 'reddit' ? 'Reddit' : 'Bluesky', " (Score: ", opp.intent_score, ")"] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { style: oppContent, children: ["\"", opp.text_content.length > 150 ? opp.text_content.substring(0, 150) + '...' : opp.text_content, "\""] }), opp.url && ((0, jsx_runtime_1.jsx)(components_1.Link, { href: opp.url, style: link, children: "View original post \u2192" }))] }, index)))] })), (0, jsx_runtime_1.jsx)(components_1.Section, { style: btnContainer, children: (0, jsx_runtime_1.jsx)(components_1.Link, { href: dashboardUrl, style: button, children: "Review Your Dashboard" }) }), (0, jsx_runtime_1.jsx)(components_1.Hr, { style: hr }), (0, jsx_runtime_1.jsxs)(components_1.Text, { style: footer, children: ["You are receiving this because you enabled Weekly Reports in BuyerWatch Settings.", unsubscribeUrl && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [" ", (0, jsx_runtime_1.jsx)(components_1.Link, { href: unsubscribeUrl, style: footerLink, children: "Unsubscribe" })] }))] })] }) })] }));
exports.WeeklyDigest = WeeklyDigest;
const main = {
    backgroundColor: '#f6f9fc',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};
const container = {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '40px 20px',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
    maxWidth: '600px',
};
const h1 = {
    color: '#1d1d1f',
    fontSize: '24px',
    fontWeight: '700',
    margin: '0 0 20px',
};
const h2 = {
    color: '#1d1d1f',
    fontSize: '18px',
    fontWeight: '600',
    margin: '30px 0 15px',
};
const text = {
    color: '#52525b',
    fontSize: '15px',
    lineHeight: '24px',
};
const statsBox = {
    backgroundColor: '#f4f4f5',
    padding: '20px',
    borderRadius: '8px',
    margin: '20px 0',
};
const statRow = {
    margin: '0 0 10px',
    color: '#27272a',
    fontSize: '14px',
};
const oppCard = {
    borderLeft: '4px solid #0A84FF',
    padding: '15px 20px',
    backgroundColor: '#f8fafc',
    marginBottom: '15px',
    borderRadius: '0 8px 8px 0',
};
const oppPlatform = {
    fontSize: '12px',
    color: '#64748b',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    margin: '0 0 8px',
};
const oppContent = {
    fontSize: '14px',
    color: '#334155',
    margin: '0 0 10px',
    lineHeight: '20px',
    fontStyle: 'italic',
};
const link = {
    color: '#0A84FF',
    fontSize: '13px',
    textDecoration: 'none',
    fontWeight: '600',
};
const btnContainer = {
    textAlign: 'center',
    margin: '30px 0',
};
const button = {
    backgroundColor: '#0A84FF',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '600',
    textDecoration: 'none',
    textAlign: 'center',
    display: 'inline-block',
    padding: '12px 24px',
};
const hr = {
    borderColor: '#e5e7eb',
    margin: '30px 0 20px',
};
const footer = {
    color: '#94a3b8',
    fontSize: '12px',
    textAlign: 'center',
};
const footerLink = {
    color: '#64748b',
    textDecoration: 'underline',
};
exports.default = exports.WeeklyDigest;
