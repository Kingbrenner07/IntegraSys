import { useGetDashboardSummary, useGetDashboardActivity } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Activity, CheckCircle, Files, ArrowUpRight } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary()
  const { data: activity, isLoading: loadingActivity } = useGetDashboardActivity()

  const stats = [
    {
      title: "Documentos Processados",
      value: summary?.documentsProcessed || 0,
      icon: FileText,
      description: "Total de PDFs processados",
    },
    {
      title: "Páginas Mensais",
      value: summary?.monthlyPages || 0,
      icon: Files, // we'll swap below
      description: "Páginas processadas este mês",
    },
    {
      title: "Taxa de Sucesso",
      value: `${summary?.successRate || 0}%`,
      icon: CheckCircle,
      description: "Extrações precisas",
    },
    {
      title: "Tarefas Ativas",
      value: summary?.activeJobs || 0,
      icon: Activity,
      description: "Em fila ou processando",
    },
  ]

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary/80">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Centro de controle
          </div>
          <h1 className="text-[1.7rem] font-bold tracking-[-0.04em] sm:text-3xl">Visão Geral</h1>
          <p className="mt-2 text-sm text-muted-foreground">
          Monitoramento do processamento de documentos de recursos humanos.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Operação normal
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loadingSummary
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-4 rounded-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-1/3 mb-2" />
                  <Skeleton className="h-3 w-2/3" />
                </CardContent>
              </Card>
            ))
          : stats.map((stat, i) => (
               <Card key={i} className="group border-card-border/80 hover:border-primary/30 hover:shadow-[0_12px_28px_hsl(var(--primary)/0.08)]">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                   <CardTitle className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{stat.title}</CardTitle>
                   <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                     <stat.icon className="h-4 w-4 text-primary" />
                   </div>
                </CardHeader>
                <CardContent>
                   <div className="font-mono text-[1.8rem] font-semibold tracking-[-0.04em] text-foreground">
                    {stat.value.toLocaleString('pt-BR')}
                  </div>
                   <p className="mt-2 text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-7">
        <Card className="lg:col-span-4 border-card-border/80">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Módulos Populares</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Distribuição de uso no período atual</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="relative mx-6 mb-6 mt-0 flex h-[260px] items-end gap-3 overflow-hidden rounded-lg border border-dashed border-border bg-muted/20 p-5 sm:gap-5">
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-primary/10 to-transparent" />
            {[58, 82, 46, 70, 38, 91, 64].map((height, index) => (
              <div key={index} className="relative flex h-full flex-1 items-end">
                <div className="w-full rounded-t-md bg-primary/30 transition-colors duration-300 hover:bg-primary/65" style={{ height: `${height}%` }} />
              </div>
            ))}
            <div className="absolute bottom-3 left-5 right-5 flex justify-between text-[0.6rem] font-mono text-muted-foreground">
              <span>SEM 01</span><span>SEM 02</span><span>SEM 03</span><span>SEM 04</span>
            </div>
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-3 border-card-border/80">
          <CardHeader>
            <CardTitle>Atividade Recente</CardTitle>
            <p className="text-xs text-muted-foreground">Últimas movimentações do sistema</p>
          </CardHeader>
          <CardContent>
            {loadingActivity ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activity?.length ? (
              <div className="space-y-6">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-start gap-4">
                    <div className="mt-0.5 rounded-lg border border-primary/20 bg-primary/10 p-2 text-primary">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium leading-none">{item.title}</p>
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatDate(item.createdAt).split(' ')[1]}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.detail}
                      </p>
                      <div className="pt-1">
                        <Badge variant={
                          item.status === 'completed' ? 'success' :
                          item.status === 'failed' ? 'destructive' :
                          'warning'
                        }>
                          {item.status === 'completed' ? 'Concluído' :
                           item.status === 'failed' ? 'Falhou' :
                           item.status === 'queued' ? 'Na fila' :
                           'Processando'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
               <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                Nenhuma atividade recente.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}