import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';

type Profile = Tables<'profiles'>;
type Aal = 'aal1' | 'aal2' | null;

type AuthState = {
  /** true selama sesi & profil pertama dimuat */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  /** Tingkat jaminan sesi saat ini (aal2 = sudah 2FA) */
  aal: Aal;
  /** aal yang bisa dicapai (aal2 bila user punya faktor 2FA terverifikasi) */
  nextAal: Aal;
  /** Owner wajib 2FA: true bila Owner belum aal2 */
  mfaRequired: boolean;
  refreshProfile: () => Promise<void>;
  refreshAal: () => Promise<void>;
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
  const [aal, setAal] = useState<Aal>(null);
  const [nextAal, setNextAal] = useState<Aal>(null);
  /** userId yang tingkat 2FA-nya sudah diperiksa (refresh token tidak memicu layar loading) */
  const [aalFor, setAalFor] = useState<string | null | undefined>(undefined);

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
  const accessToken = session?.access_token ?? null;

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

  const refreshAal = useCallback(async () => {
    if (!accessToken) {
      setAal(null);
      setNextAal(null);
      setAalFor(null);
      return;
    }
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal((data?.currentLevel as Aal) ?? null);
    setNextAal((data?.nextLevel as Aal) ?? null);
    setAalFor(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    void refreshAal();
  }, [refreshAal]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading: !sessionLoaded || profileFor !== userId || aalFor !== userId,
      session,
      profile,
      profileError,
      aal,
      nextAal,
      mfaRequired: profile?.role === 'owner' && aal !== 'aal2',
      refreshProfile,
      refreshAal,
      signOut,
    }),
    [sessionLoaded, userId, profileFor, aalFor, session, profile, profileError, aal, nextAal, refreshProfile, refreshAal, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  return ctx;
}
