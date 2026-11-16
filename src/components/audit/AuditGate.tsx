import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Lock, Mail, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuditSession } from "./AuditSession";

const LOGO_URL =
  "https://cdn.redeancora.com.br/Manual_da_Marca/Logotipo_Oficial/Logotipo_Oficial_Rede_ANCORA.png";

type Mode = "entrar" | "criar" | "recuperar";

function friendlyError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (lower.includes("email not confirmed"))
    return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
  if (lower.includes("already registered"))
    return "Este e-mail já possui cadastro. Entre com sua senha.";
  if (lower.includes("password"))
    return "A senha precisa ter pelo menos 6 caracteres.";
  return message;
}

export function AuditGate({ children }: { children: ReactNode }) {
  const { user, pending, recovery, endRecovery } = useAuditSession();
  const [mode, setMode] = useState<Mode>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function reset(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "entrar") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else if (mode === "criar") {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) throw err;
        setNotice("Cadastro criado! Confirme o e-mail enviado para ativar seu acesso.");
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (err) throw err;
        setNotice("Enviamos um link de redefinição de senha para seu e-mail.");
      }
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPassword });
      if (err) throw err;
      endRecovery();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "lovable") {
    setBusy(true);
    setError("");
    try {
      if (provider === "google") {
        const { error: err } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin },
        });
        if (err) throw err;
      } else {
        const result = await lovable.auth.signInWithOAuth("lovable", {
          redirect_uri: window.location.origin,
        });
        if ("error" in result && result.error) throw result.error;
      }
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <div className="gate">
        <div className="gate-card" style={{ alignItems: "center", textAlign: "center" }}>
          <Loader2 className="spin" size={28} />
          <p className="gate-sub">Verificando seu acesso…</p>
        </div>
      </div>
    );
  }

  if (user && recovery) {
    return (
      <div className="gate">
        <div className="gate-card">
          <img className="gate-logo" src={LOGO_URL} alt="Rede ANCORA" />
          <h1 className="gate-title">Redefinir senha</h1>
          <p className="gate-sub">Escolha uma nova senha para sua conta.</p>
          <form className="gate-form" onSubmit={submitNewPassword}>
            <div className="field gate-input">
              <Lock />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Nova senha"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            {error && <p className="gate-error">{error}</p>}
            <button className="btn btn-primary gate-submit" type="submit" disabled={busy}>
              {busy ? <Loader2 className="spin" size={16} /> : null} Salvar nova senha
            </button>
          </form>
        </div>
        <p className="gate-foot">Rede ANCORA · Logística Nacional</p>
      </div>
    );
  }

  if (user) return <>{children}</>;

  return (
    <div className="gate">
      <div className="gate-card">
        <img className="gate-logo" src={LOGO_URL} alt="Rede ANCORA" />
        <h1 className="gate-title">Auditoria Inteligente de Fretes</h1>
        <p className="gate-sub">Rede ANCORA · Logística Nacional</p>

        <div className="gate-pending">
          <ShieldAlert />
          <div>
            <b>Acesso restrito</b>
            <p>
              Entre com sua conta autorizada. Novos usuários precisam de autorização do
              administrador após o cadastro.
            </p>
          </div>
        </div>

        <form className="gate-form" onSubmit={submit}>
          <div className="field gate-input">
            <Mail />
            <input
              type="email"
              required
              placeholder="Seu e-mail"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {mode !== "recuperar" && (
            <div className="field gate-input">
              <Lock />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Sua senha"
                autoComplete={mode === "entrar" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {error && <p className="gate-error">{error}</p>}
          {notice && <p className="gate-notice">{notice}</p>}
          <button className="btn btn-primary gate-submit" type="submit" disabled={busy}>
            {busy ? <Loader2 className="spin" size={16} /> : null}
            {mode === "entrar" ? "Entrar" : mode === "criar" ? "Criar cadastro" : "Enviar link"}
          </button>
        </form>

        <div className="gate-links">
          {mode === "entrar" ? (
            <>
              <button type="button" onClick={() => reset("recuperar")}>
                Esqueci a senha
              </button>
              <button type="button" onClick={() => reset("criar")}>
                Criar cadastro
              </button>
            </>
          ) : (
            <button type="button" onClick={() => reset("entrar")}>
              Voltar para o login
            </button>
          )}
        </div>

        <div className="gate-divider">ou continue com</div>
        <div className="gate-oauth">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void oauth("google")}
          >
            Google
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void oauth("lovable")}
          >
            Lovable
          </button>
        </div>
      </div>
      <p className="gate-foot">Rede ANCORA · Logística Nacional</p>
    </div>
  );
}
