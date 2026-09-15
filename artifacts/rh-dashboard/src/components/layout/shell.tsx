import * as React from "react"
import { Link, useLocation } from "wouter"
import { FileText, LayoutDashboard, Settings, UserCircle, Files, LogOut, FileClock } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth, type AuthProfile } from "@/lib/auth-context"

const NAVIGATION = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
    ]
  },
  {
    title: "Módulos de Processamento",
    items: [
      { label: "Separação de Contracheques", href: "/modulos/contracheques", icon: FileText },
      { label: "Folha de Ponto", href: "/modulos/folha-de-ponto", icon: FileClock },
      { label: "Separador Contratuais/Demissionais", href: "/modulos/documentos-rh", icon: Files },
    ]
  },
  {
    title: "Administração",
    items: [
      { label: "Usuários", href: "/admin/usuarios", icon: UserCircle },
      { label: "Configurações", href: "/admin/configuracoes", icon: Settings },
    ]
  }
]

export function LayoutShell({
  children,
  profile,
}: {
  children: React.ReactNode
  profile?: AuthProfile
}) {
  const [location] = useLocation()
  const auth = useAuth()
  const currentProfile = profile ?? auth.profile
  const navigation = currentProfile?.role === "admin"
    ? NAVIGATION
    : NAVIGATION.filter((section) => section.title !== "Administração")
  const displayName = currentProfile?.email ?? "Usuário"
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <div className="flex min-h-[100dvh] w-full bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-[4.5rem] items-center border-b border-sidebar-border px-6">
          <div className="flex items-center gap-3 font-semibold tracking-tight">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_6px_18px_hsl(var(--primary)/0.25)]">
              <Files className="h-[1.15rem] w-[1.15rem]" />
            </div>
            <div>
              <div className="text-[0.95rem]">IntegraSys <span className="text-primary">RH</span></div>
              <div className="mt-0.5 text-[0.62rem] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/50">Painel de operações</div>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto py-7">
          <nav className="grid gap-7 px-4">
            {navigation.map((section, idx) => (
              <div key={idx} className="space-y-2.5">
                <div className="px-3 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/45">
                  {section.title}
                </div>
                <div className="grid gap-1">
                  {section.items.map((item) => {
                    const isActive = location === item.href
                    return (
                      <Link key={item.href} href={item.href} className="group flex flex-col">
                        <div
                          className={cn(
                            "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.8rem] transition-all duration-200",
                            isActive 
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-[inset_3px_0_0_hsl(var(--primary))]" 
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground"
                          )}
                        >
                          <item.icon className={cn("h-[1.05rem] w-[1.05rem] transition-colors", isActive ? "text-primary" : "text-sidebar-foreground/50 group-hover:text-primary/80")} />
                          {item.label}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="border-t border-sidebar-border p-4">
          <button
            type="button"
            onClick={() => {
              void auth.signOut()
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col md:pl-72">
        <header className="sticky top-0 z-10 flex min-h-[4.5rem] items-center gap-4 border-b border-border/80 bg-background/90 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Files className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">IntegraSys <span className="text-primary">RH</span></span>
          </div>
          <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex">
            <span className="mr-3 flex shrink-0 items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Ambiente seguro
            </span>
          </nav>
          <div className="flex-1 md:hidden" />
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-bold text-primary">
              {initials}
            </div>
            <span className="hidden max-w-[15rem] truncate text-sm font-medium text-foreground/85 sm:inline">{displayName}</span>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border/70 bg-sidebar/40 px-3 py-2 md:hidden">
          {navigation.flatMap((section) => section.items).map((item) => {
            const isActive = location === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto w-full max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
