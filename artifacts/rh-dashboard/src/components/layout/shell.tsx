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
    <div className="flex min-h-screen w-full bg-muted/30">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-10 w-64 flex-col border-r bg-sidebar md:flex hidden">
        <div className="flex h-14 items-center border-b px-6">
          <div className="flex items-center gap-2 font-bold tracking-tight">
            <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary text-primary-foreground">
              <Files className="h-4 w-4" />
            </div>
            IntegraSys RH
          </div>
        </div>
        
        <div className="flex-1 overflow-auto py-4">
          <nav className="grid gap-6 px-4">
            {navigation.map((section, idx) => (
              <div key={idx} className="space-y-2">
                <div className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {section.title}
                </div>
                <div className="grid gap-1">
                  {section.items.map((item) => {
                    const isActive = location === item.href
                    return (
                      <Link key={item.href} href={item.href} className="flex flex-col">
                        <div
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                            isActive 
                              ? "bg-primary/10 text-primary font-medium" 
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          )}
                        >
                          <item.icon className="h-4 w-4" />
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

        <div className="border-t p-4">
          <button
            type="button"
            onClick={() => {
              void auth.signOut()
            }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-6">
          {/* Mobile menu could go here */}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">
              {initials}
            </div>
            <span className="text-sm font-medium">{displayName}</span>
          </div>
        </header>
        <main className="flex-1 p-6">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
