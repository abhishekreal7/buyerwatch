"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServiceRoleClient = getServiceRoleClient;
exports.requireAdmin = requireAdmin;
exports.requireAdminForAction = requireAdminForAction;
require("server-only");
const supabase_js_1 = require("@supabase/supabase-js");
const navigation_1 = require("next/navigation");
const server_1 = require("../utils/supabase/server");
function configuredAdminEmails() {
    return new Set((process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean));
}
function getServiceRoleClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
        throw new Error('Server database configuration is missing');
    return (0, supabase_js_1.createClient)(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}
async function requireAdmin() {
    const supabase = await (0, server_1.createClient)();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email)
        (0, navigation_1.redirect)('/login');
    if (!configuredAdminEmails().has(user.email.toLowerCase()))
        (0, navigation_1.redirect)('/dashboard');
    return {
        user,
        admin: getServiceRoleClient(),
    };
}
async function requireAdminForAction() {
    const supabase = await (0, server_1.createClient)();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email || !configuredAdminEmails().has(user.email.toLowerCase())) {
        throw new Error('Unauthorized');
    }
    return {
        user,
        admin: getServiceRoleClient(),
    };
}
