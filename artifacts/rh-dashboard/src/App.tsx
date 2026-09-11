import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Redirect,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import { LayoutShell } from '@/components/layout/shell';
import Login from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import PayslipModule from '@/pages/modules/contracheques';
import TimesheetModule from '@/pages/modules/folha-de-ponto';
import HrDocumentsModule from '@/pages/modules/documentos-rh';
import AdminUsers from '@/pages/admin/usuarios';
import { AuthProvider, useAuth } from '@/lib/auth-context';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  const [location] = useLocation();
  const { session, profile, loading } = useAuth();
  const pathname = location.split(/[?#]/, 1)[0];

  const isLoginRoute =
    pathname === "/login" || pathname === "/rh-dashboard/login";

  if (isLoginRoute) {
    return <Login />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 text-sm text-muted-foreground">
        Restaurando sua sessão segura…
      </div>
    );
  }

  if (!session || !profile) {
    return <Redirect to={`/login?returnTo=${encodeURIComponent(pathname)}`} />;
  }

  if (pathname.startsWith("/admin/") && profile.role !== "admin") {
    return (
      <LayoutShell profile={profile}>
        <div className="rounded-lg border bg-background p-8 text-center">
          <h1 className="text-xl font-semibold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Apenas administradores podem acessar esta área.
          </p>
        </div>
      </LayoutShell>
    );
  }

  return (
    <LayoutShell profile={profile}>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/modulos/contracheques" component={PayslipModule} />
          <Route path="/modulos/folha-de-ponto" component={TimesheetModule} />
          <Route path="/modulos/documentos-rh" component={HrDocumentsModule} />
          <Route path="/admin/usuarios" component={AdminUsers} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </LayoutShell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
