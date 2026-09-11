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
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-lg">
            <Files className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">IntegraSys RH</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Console de Operações de Processamento
          </p>
        </div>

        <Card className="border-border/50 shadow-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">
              {isReset
                ? "Criar nova senha"
                : isForgot
                  ? "Recuperar acesso"
                  : "Acesso ao Sistema"}
            </CardTitle>
            <CardDescription>
              {isReset
                ? "Escolha uma senha nova para sua conta."
                : isForgot
                  ? "Enviaremos um link para o e-mail autorizado."
                  : "Entre com seu e-mail corporativo e sua senha."}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                <p role="alert" className="text-sm text-destructive">
                  {error ?? authError}
                </p>
              )}
              {message && <p className="text-sm text-emerald-700">{message}</p>}
              {!isConfigured && (
                <p className="rounded-md bg-amber-500/10 p-3 text-xs text-amber-800">
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
                  className="w-full text-center text-xs text-primary hover:underline"
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