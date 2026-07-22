/**
 * ============================================================
 * SUPABASE CONFIGURATION
 * ============================================================
 * This is the ONLY place your project keys live.
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://supabase.com and create a free project
 *    (name it something like "janu-print-fab")
 * 2. In your Supabase project dashboard, go to:
 *    Project Settings -> API
 * 3. Copy the "Project URL" and paste it below as SUPABASE_URL
 * 4. Copy the "anon public" key (NOT the service_role key!)
 *    and paste it below as SUPABASE_ANON_KEY
 *
 * SECURITY NOTE:
 * The anon key is SAFE to expose in frontend code — it is
 * designed for that. It only allows what your Row Level
 * Security (RLS) policies allow, which we'll build in the
 * database module. NEVER put the service_role key in any
 * file that reaches the browser.
 * ============================================================
 */

const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL_HERE";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY_HERE";

// Supabase client library (loaded via CDN in the HTML <head>)
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Make it globally available to every service file
window.db = supabaseClient;
