import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
const LovableMark = () => <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>;
import { Button } from "@/components/ui/button";

const SessionContext = createContext<{ user: User | null; pending: boolean }>({ user: null, pending: true });
export function AuditSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [pending, setPending] = useState(true);
  const client = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => { if (active) { setUser(data.user); setPending(false); } });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
      setUser(session?.user ?? null);
      setPending(false);
      void router.invalidate();
      if (event !== "SIGNED_OUT") void client.invalidateQueries();
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [client, router]);
  return <SessionContext.Provider value={{ user, pending }}>{children}</SessionContext.Provider>;
}
export const useAuditSession = () => useContext(SessionContext);
export function AuditSignIn() {
  const { user, pending } = useAuditSession();
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  async function signIn(provider: "google" | "lovable") {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (result.error) setMessage("Não foi possível entrar. Tente novamente.");
  }
  if (pending) return <span>Verificando acesso…</span>;
  return <div className="settings-commands">{user ? <><span>{user.email}</span><Button variant="outline" onClick={async () => { await client.cancelQueries(); client.clear(); await supabase.auth.signOut(); }}>Sair</Button></> : <>
    <Button variant="outline" onClick={() => void signIn("google")}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>Continuar com Google</Button>
    <Button variant="outline" onClick={() => void signIn("lovable")}><LovableMark />Continuar com Lovable</Button>
  </>}{message && <span role="alert">{message}</span>}</div>;
}