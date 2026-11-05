import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';

type Profile = Tables<'profiles'>;

type AuthState = {
  /** true selama sesi & profil pertama dimuat */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const lastUser = useRef<string | null | undefined>(undefined);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  /** userId yang profilnya sudah dimuat (mencegah tampilan data basi saat ganti akun) */
  const [profileFor, setProfileFor] = useState<string | null | undefined>(undefined);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Jangan bawa data akun sebelumnya ke akun berikutnya.
      const uid = s?.user.id ?? null;
      if (event === 'SIGNED_OUT' || (lastUser.current !== undefined && lastUser.current !== uid)) queryClient.removeQueries();
      lastUser.current = uid;
      setSession(s);
      setSessionLoaded(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id ?? null;

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setProfileFor(null);
      return;
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfileError(error ? error.message : null);
    setProfile(data ?? null);
    setProfileFor(userId);
  }, [userId]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading: !sessionLoaded || profileFor !== userId,
      session,
      profile,
      profileError,
      refreshProfile,
      signOut,
    }),
    [sessionLoaded, userId, profileFor, session, profile, profileError, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  return ctx;
}
