import { useState } from "react"
import { useListAdminUsers, useInviteAdminUser, useUpdateAdminUserStatus, useUpdateAdminUserRole, getListAdminUsersQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils"
import { UserPlus, Shield, Ban, CheckCircle2, UserCircle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { AdminUserRole } from "@workspace/api-client-react" // Importing the enum

export default function AdminUsers() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  const { data: users, isLoading } = useListAdminUsers()
  const inviteUser = useInviteAdminUser()
  const updateStatus = useUpdateAdminUserStatus()
  const updateRole = useUpdateAdminUserRole()

  const [email, setEmail] = useState("")
  const [role, setRole] = useState<AdminUserRole>("operator")

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    inviteUser.mutate({
      data: {
        email,
        role
      }
    }, {
      onSuccess: () => {
        toast({ title: "Convite enviado", description: `Um e-mail de acesso foi enviado para ${email}.` })
        setEmail("")
        queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() })
      },
      onError: () => {
        toast({ title: "Erro", description: "Não foi possível enviar o convite.", variant: "destructive" })
      }
    })
  }

  const toggleStatus = (userId: number, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active'
    
    updateStatus.mutate({
      userId,
      data: { status: newStatus }
    }, {
      onSuccess: () => {
        toast({ title: "Status atualizado", description: "O acesso do usuário foi alterado." })
        queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() })
      }
    })
  }

  const changeRole = (userId: number, nextRole: AdminUserRole) => {
    updateRole.mutate(
      { userId, data: { role: nextRole } },
      {
        onSuccess: () => {
          toast({ title: "Função atualizada", description: "A permissão do usuário foi alterada." })
          queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() })
        },
        onError: () => {
          toast({ title: "Erro", description: "Não foi possível alterar a função.", variant: "destructive" })
        },
      },
    )
  }

  return (
    <div className="space-y-7">
      <div>
        <div className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary/80">Administração</div>
        <h1 className="text-[1.7rem] font-bold tracking-[-0.04em] sm:text-3xl">Gestão de Usuários</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Controle de acesso e permissões da plataforma operacional.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1">
            <Card className="sticky top-24 border-card-border/80">
            <CardHeader>
              <CardTitle>Novo Acesso</CardTitle>
              <CardDescription>Convidar membro da equipe</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInvite} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail Corporativo</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="nome@empresa.com.br"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Nível de Permissão</Label>
                  <select 
                    id="role" 
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={role}
                    onChange={(e) => setRole(e.target.value as AdminUserRole)}
                    required
                  >
                    <option value="operator">Operador (Apenas envia processamentos)</option>
                    <option value="admin">Administrador (Acesso total)</option>
                  </select>
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={inviteUser.isPending}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Enviar Convite
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-4">
          <Card className="border-card-border/80">
            <CardHeader className="pb-4">
              <CardTitle>Usuários Ativos</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {isLoading ? (
                <div className="p-6 space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : users && users.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Adicionado em</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">
                              {user.email.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium text-sm">{user.email}</span>
                          </div>
                        </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              {user.role === 'admin' ? <Shield className="h-3 w-3" /> : <UserCircle className="h-3 w-3" />}
                              <select
                                aria-label={`Função de ${user.email}`}
                                className="rounded border bg-background px-1.5 py-1 text-xs"
                                value={user.role}
                                onChange={(event) => changeRole(user.id, event.target.value as AdminUserRole)}
                                disabled={updateRole.isPending}
                              >
                                <option value="operator">Operador</option>
                                <option value="admin">Administrador</option>
                              </select>
                            </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            user.status === 'active' ? 'success' :
                            user.status === 'suspended' ? 'destructive' :
                            'secondary'
                          }>
                            {user.status === 'active' ? 'Ativo' :
                             user.status === 'suspended' ? 'Suspenso' :
                             'Pendente'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {formatDate(user.createdAt).split(' ')[0]}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            aria-label={`${user.status === 'active' ? 'Suspender' : 'Ativar'} ${user.email}`}
                            className={user.status === 'active' ? 'text-destructive hover:text-destructive hover:bg-destructive/10' : 'text-emerald-600 hover:text-emerald-600 hover:bg-emerald-50'}
                            onClick={() => toggleStatus(user.id, user.status)}
                            disabled={updateStatus.isPending || updateRole.isPending || user.status === 'invited'}
                          >
                            {user.status === 'active' ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-10 text-muted-foreground">
                  <UserPlus className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p>Nenhum usuário cadastrado.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
