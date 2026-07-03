"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseWorker = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
exports.supabaseWorker = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
