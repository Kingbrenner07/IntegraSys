import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { supabase, getAuthRedirectUrl, isSupabaseConfigured } from "./supabase";
import { apiUrl } from "./api-url";

export type UserRole = "admin" | "operator";

export type AuthProfile = {
  id: string;
  email: string;
  role: UserRole;
  status: "active";
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: AuthProfile | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function getProfile(session: Session): Promise<AuthProfile> {
  const response = await fetch(apiUrl("/api/auth/me"), {
    headers: {
      authorization: `Bearer ${session.access_token}`,
      accept: "application/json",
    },
  });
  const body = (await response.json().catch(() => null)) as
    | { error?: string }
    | AuthProfile
    | null;
  if (!response.ok) {
    throw new Error(
      body && "error" in body && body.error
        ? body.error
        : "Sua conta não tem acesso ao painel.",
    );
  }
  return body as AuthProfile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    setAuthTokenGetter(
      client
        ? async () => (await client.auth.getSession()).data.session?.access_token ?? null
        : null,
    );

    if (!client) {
      setLoading(false);
      return () => setAuthTokenGetter(null);
    }

    let mounted = true;
    const loadSession = async (nextSession: Session | null) => {
      if (!mounted) return;
      setLoading(true);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (!nextSession) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const nextProfile = await getProfile(nextSession);
        if (!mounted) return;
        setProfile(nextProfile);
        setError(null);
      } catch (profileError) {
        if (!mounted) return;
        setProfile(null);
        setError(
          getErrorMessage(
            profileError,
            "Sua conta não está autorizada a acessar este painel.",
          ),
        );
        await client.auth.signOut();
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const initializeSession = async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const verificationType = params.get("type");

      if (tokenHash && verificationType === "recovery") {
        const { data, error: verificationError } = await client.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        window.history.replaceState(
          {},
          "",
          `${window.location.pathname}?mode=reset`,
        );
        if (verificationError) {
          setError(
            getErrorMessage(
              verificationError,
              "O link de recuperação é inválido ou expirou.",
            ),
          );
          setLoading(false);
          return;
        }
        await loadSession(data.session);
        return;
      }

      const { data, error: sessionError } = await client.auth.getSession();
      if (sessionError) {
        setError(getErrorMessage(sessionError, "Não foi possível restaurar a sessão."));
        setLoading(false);
        return;
      }
      await loadSession(data.session);
    };

    void initializeSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      void loadSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      setAuthTokenGetter(null);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      loading,
      error,
      isConfigured: isSupabaseConfigured,
      async signIn(email, password) {
        if (!supabase) throw new Error("O Supabase ainda não foi configurado.");
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (signInError) throw signInError;
      },
      async signOut() {
        if (!supabase) return;
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw signOutError;
      },
      async sendPasswordReset(email) {
        if (!supabase) throw new Error("O Supabase ainda não foi configurado.");
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email.trim().toLowerCase(),
          { redirectTo: getAuthRedirectUrl("reset") },
        );
        if (resetError) throw resetError;
      },
      async updatePassword(password) {
        if (!supabase) throw new Error("O Supabase ainda não foi configurado.");
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
      },
    }),
    [error, loading, profile, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return context;
}
