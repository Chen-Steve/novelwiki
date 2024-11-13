import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined
  }
});

// Add a debug listener for auth state changes
if (process.env.NODE_ENV !== 'production') {
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('Supabase Auth State Change:', event, session?.user?.id);
  });
}

export default supabase;