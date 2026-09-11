import { Fragment, useState } from "react"
import { getListProcessingJobsQueryKey, useListProcessingJobs } from "@workspace/api-client-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils"
import { Upload, FileClock, Download, Loader2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { ProcessingActions } from "@/components/processing-actions"
import { getProcessingErrorMessage, uploadProcessingFile } from "@/lib/processing"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CircleAlert } from "lucide-react"

export default function TimesheetModule() {
  const { toast } = useToast()
  
  const { data: jobs, isLoading } = useListProcessingJobs({
    query: { queryKey: getListProcessingJobsQueryKey(), refetchInterval: 2000 },
  })

  const [file, setFile] = useState<File | null>(null)
  const [month, setMonth] = useState("")
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  
  const timesheetJobs = jobs?.filter(j => j.moduleId === 'attendance') || []

  const handleProcess = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !month || !year) {
      toast({ title: "Preencha todos os campos", variant: "destructive" })
      return
    }

    setUploadError(null)
    setUploading(true)
    try {
      await uploadProcessingFile({
        file,
        moduleId: "attendance",
        month,
        year,
      })
      toast({ title: "Processamento iniciado", description: `Referência: ${month}/${year}` })
      setFile(null)
    } catch (error) {
      const message = getProcessingErrorMessage(error)
      setUploadError(message)
      toast({
        title: "Erro ao enviar PDF",
        description: message,
        variant: "destructive",
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Folha de Ponto</h1>
        <p className="text-muted-foreground mt-1">
          Separação e renomeação de espelhos de ponto com extração de competência.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1 space-y-6">
          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>Extração Mensal</CardTitle>
              <CardDescription>Defina a competência e faça upload</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProcess} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="month">Mês</Label>
                    <select 
                      id="month" 
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                      required
                    >
                      <option value="" disabled>Selecione</option>
                      {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="year">Ano</Label>
                    <select 
                      id="year" 
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      required
                    >
                      {Array.from({ length: 16 }, (_, index) => {
                        const yVal = new Date().getFullYear() + 5 - index
                        return <option key={yVal} value={yVal.toString()}>{yVal}</option>
                      })}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Arquivo PDF Consolidado</Label>
                  <div className="border-2 border-dashed border-input rounded-lg p-6 flex flex-col items-center justify-center text-center bg-muted/20 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => document.getElementById('file-upload')?.click()}>
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    {file ? (
                      <div className="text-sm font-medium truncate max-w-full px-4">{file.name}</div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Clique para selecionar</div>
                    )}
                    <input 
                      id="file-upload" 
                      type="file" 
                      accept=".pdf" 
                      className="hidden" 
                      onChange={(e) => {
                        setFile(e.target.files?.[0] || null)
                        setUploadError(null)
                      }}
                    />
                  </div>
                </div>
                {uploadError && (
                  <Alert variant="destructive">
                    <CircleAlert className="h-4 w-4" />
                    <AlertTitle>Upload rejeitado</AlertTitle>
                    <AlertDescription>{uploadError}</AlertDescription>
                  </Alert>
                )}

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={!file || !month || uploading}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileClock className="h-4 w-4 mr-2" />}
                  Processar Folha
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card className="md:col-span-2 border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Histórico Recente</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : timesheetJobs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Páginas</TableHead>
                    <TableHead>Progresso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Baixar lote</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timesheetJobs.map((job) => (
                    <Fragment key={job.id}>
                    <TableRow>
                      <TableCell className="font-medium max-w-[150px] truncate" title={job.fileName}>
                        {job.fileName}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatDate(job.createdAt)}
                      </TableCell>
                      <TableCell>{job.pages}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {job.progress}% · {job.outputCount} saída(s)
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          job.status === 'completed' ? 'success' :
                          job.status === 'failed' ? 'destructive' :
                          'warning'
                        }>
                          {job.status === 'completed' ? 'Concluído' :
                           job.status === 'failed' ? 'Falhou' :
                           job.status === 'queued' ? 'Na fila' :
                           'Processando'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <ProcessingActions jobId={job.id} completed={job.status === "completed"} />
                      </TableCell>
                    </TableRow>
                    {job.errorMessage && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-1 text-xs text-destructive">
                          {job.errorMessage}
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <FileClock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p>Nenhum processamento de folha recente.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
