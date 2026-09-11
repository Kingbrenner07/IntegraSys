import { useGetDashboardSummary, useGetDashboardActivity } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Activity, CheckCircle, Clock } from "lucide-react"
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
        <p className="text-muted-foreground mt-1">
          Monitoramento do processamento de documentos de recursos humanos.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              <Card key={i} className="border-border/50 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono tracking-tight">
                    {stat.value.toLocaleString('pt-BR')}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Módulos Populares</CardTitle>
          </CardHeader>
          <CardContent className="flex h-[300px] items-center justify-center text-muted-foreground border-t border-dashed bg-muted/10 m-6 mt-0 rounded-md">
            Gráfico de Uso de Módulos
          </CardContent>
        </Card>
        
        <Card className="col-span-3 border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Atividade Recente</CardTitle>
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
                    <div className="bg-primary/10 text-primary rounded-full p-2 mt-0.5">
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
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                Nenhuma atividade recente.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
// Temporary import fix for the icon array above
import { Files } from "lucide-react"