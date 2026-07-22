/**
 * ============================================================
 * SUPABASE CONFIGURATION — JANU PRINT | FAB
 * This file connects your website to your Supabase project.
 * You do not need to change anything in this file.
 * ============================================================
 */

const SUPABASE_URL = "https://gilveahoqbgqomerrov.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dXLX-ARW9df6aTdqANKRUQ_ceuui0kw";

// Supabase client library (loaded via CDN in the HTML <head>)
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Make it available to every other file on the site
window.db = supabaseClient;
