import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Files, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

type LoginMode = "login" | "forgot" | "reset";

function getMode(): LoginMode {
  const mode = new URLSearchParams(window.location.search).get("mode");
  return mode === "forgot" || mode === "reset" ? mode : "login";
}

export default function Login() {
  const [location, setLocation] = useLocation();
  const {
    signIn,
    sendPasswordReset,
    updatePassword,
    signOut,
    isConfigured,
    error: authError,
    session,
  } = useAuth();
  const [mode, setMode] = useState<LoginMode>(getMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (session && mode === "login" && location !== "/") setLocation("/");
  }, [location, mode, session, setLocation]);

  if (session && mode === "login") return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      if (mode === "forgot") {
        await sendPasswordReset(email);
        setMessage("Se o e-mail estiver autorizado, enviaremos um link para redefinir a senha.");
        return;
      }
      if (mode === "reset") {
        if (password.length < 8) {
          throw new Error("A nova senha deve ter pelo menos 8 caracteres.");
        }
        if (password !== confirmation) {
          throw new Error("As senhas não conferem.");
        }
        await updatePassword(password);
        await signOut();
        setMessage("Senha atualizada. Você já pode entrar no painel.");
        setMode("login");
        setPassword("");
        setConfirmation("");
        return;
      }
      await signIn(email, password);
      setLocation("/");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível concluir a operação.",
      );
    } finally {
      setPending(false);
    }
  };

  const isReset = mode === "reset";
  const isForgot = mode === "forgot";

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-background p-4 sm:p-6">
      <div className="pointer-events-none absolute -left-32 top-[-15rem] h-[34rem] w-[34rem] rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -right-32 h-[32rem] w-[32rem] rounded-full bg-sky-500/5 blur-3xl" />
      <div className="relative w-full max-w-[440px]">
        <div className="mb-7 flex flex-col items-center justify-center text-center sm:mb-8">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_30px_hsl(var(--primary)/0.26)]">
            <Files className="h-7 w-7" />
          </div>
          <h1 className="text-[1.7rem] font-bold tracking-[-0.04em]">IntegraSys <span className="text-primary">RH</span></h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Console de Operações de Processamento
          </p>
        </div>

        <Card className="border-card-border/80 bg-card/95 shadow-[var(--shadow-md)] backdrop-blur">
          <CardHeader className="space-y-2 p-6 pb-5 sm:p-7 sm:pb-5">
            <div className="mb-1 flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-primary/80">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Acesso protegido
            </div>
            <CardTitle className="text-xl tracking-[-0.025em]">
              {isReset
                ? "Criar nova senha"
                : isForgot
                  ? "Recuperar acesso"
                  : "Acesso ao Sistema"}
            </CardTitle>
            <CardDescription className="leading-relaxed">
              {isReset
                ? "Escolha uma senha nova para sua conta."
                : isForgot
                  ? "Enviaremos um link para o e-mail autorizado."
                  : "Entre com seu e-mail corporativo e sua senha."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0 sm:p-7 sm:pt-0">
            <form onSubmit={submit} className="space-y-4">
              {!isReset && (
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail corporativo</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete={isForgot ? "email" : "username"}
                    placeholder="nome@empresa.com.br"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
              )}
              {!isForgot && (
                <div className="space-y-2">
                  <Label htmlFor="password">{isReset ? "Nova senha" : "Senha"}</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={isReset ? "new-password" : "current-password"}
                    minLength={isReset ? 8 : undefined}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
              )}
              {isReset && (
                <div className="space-y-2">
                  <Label htmlFor="confirmation">Confirmar nova senha</Label>
                  <Input
                    id="confirmation"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    required
                  />
                </div>
              )}

               {(error || authError) && (
                 <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive-foreground">
                  {error ?? authError}
                </p>
              )}
               {message && <p className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2.5 text-sm text-emerald-200">{message}</p>}
              {!isConfigured && (
                 <p className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-relaxed text-amber-200">
                  O acesso está indisponível até que as variáveis públicas do Supabase sejam configuradas.
                </p>
              )}

              <Button type="submit" className="w-full" disabled={pending || !isConfigured}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isReset ? "Atualizar senha" : isForgot ? "Enviar link" : "Entrar no Console"}
              </Button>

              {!isReset && (
                <button
                  type="button"
                   className="w-full rounded-md py-1 text-center text-xs font-medium text-primary transition-colors hover:bg-primary/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setError(null);
                    setMessage(null);
                    setMode(isForgot ? "login" : "forgot");
                  }}
                >
                  {isForgot ? "Voltar para o login" : "Esqueceu a senha?"}
                </button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}