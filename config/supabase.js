require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Validate that environment variables are set
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Missing Supabase environment variables!');
    console.error('   Make sure you have a .env file with SUPABASE_URL and SUPABASE_ANON_KEY');
    process.exit(1);
}

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: false // Server-side, we handle sessions ourselves
    }
});

module.exports = {
    supabase,
    SUPABASE_URL,
    SUPABASE_ANON_KEY
};
