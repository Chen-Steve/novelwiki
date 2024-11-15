import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    const next = requestUrl.searchParams.get('next') ?? '/';

    if (!code) {
      throw new Error('No code provided');
    }

    // Get stored state and code verifier from cookies
    const cookieStore = cookies();
    const storedState = cookieStore.get('discord_oauth_state')?.value;
    const codeVerifier = cookieStore.get('discord_code_verifier')?.value;

    // Verify state matches to prevent CSRF attacks
    if (state !== storedState) {
      throw new Error('State mismatch');
    }

    if (!codeVerifier) {
      throw new Error('No code verifier found');
    }

    const supabase = createRouteHandlerClient({ 
      cookies: () => cookieStore,
    });

    // Exchange the auth code for a session
    const { data: { session }, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    
    if (exchangeError) throw exchangeError;
    if (!session?.user) throw new Error('No user in session');

    // Check if profile exists
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', session.user.id)
      .single();

    // Only throw error if it's not a "not found" error
    if (profileCheckError && profileCheckError.code !== 'PGRST116') {
      throw profileCheckError;
    }

    // Create profile if it doesn't exist
    if (!existingProfile) {
      const discordUsername = session.user.user_metadata?.preferred_username || 
                            session.user.user_metadata?.full_name ||
                            session.user.user_metadata?.name ||
                            `User${Math.random().toString(36).slice(2, 7)}`;

      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: session.user.id,
          username: discordUsername,
          avatar_url: session.user.user_metadata?.avatar_url,
          discord_id: session.user.user_metadata?.provider_id,
          role: 'USER',
          current_streak: 0,
          coins: 0,
          last_visit: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (insertError) throw insertError;
    }

    // Use the 'next' parameter in the redirect
    const response = NextResponse.redirect(new URL(next, requestUrl.origin));
    response.cookies.delete('discord_oauth_state');
    response.cookies.delete('discord_code_verifier');

    return response;

  } catch (error) {
    console.error('Auth callback error:', error);
    const response = NextResponse.redirect(
      new URL(
        `/auth?error=${encodeURIComponent(error instanceof Error ? error.message : 'Authentication failed')}`,
        request.url
      )
    );
    response.cookies.delete('discord_oauth_state');
    response.cookies.delete('discord_code_verifier');
    return response;
  }
} 