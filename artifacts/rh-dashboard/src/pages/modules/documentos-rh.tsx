import { Fragment, useState } from "react"
import { getListProcessingJobsQueryKey, useListProcessingJobs } from "@workspace/api-client-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils"
import { Upload, FolderTree, Download, Loader2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { ProcessingActions } from "@/components/processing-actions"
import { getProcessingErrorMessage, uploadProcessingFile } from "@/lib/processing"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CircleAlert } from "lucide-react"

export default function HrDocumentsModule() {
  const { toast } = useToast()
  
  const { data: jobs, isLoading } = useListProcessingJobs({
    query: { queryKey: getListProcessingJobsQueryKey(), refetchInterval: 2000 },
  })

  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  
  const hrJobs = jobs?.filter(j => j.moduleId === 'hr-documents') || []

  const handleProcess = async (e: React.FormEvent) => {
    e.preventDefault()
    if (files.length === 0) {
      toast({ title: "Selecione arquivos", variant: "destructive" })
      return
    }

    setUploadError(null)
    setUploading(true)
    try {
      await Promise.all(files.map((file) => uploadProcessingFile({
        file,
        moduleId: "hr-documents",
      })))
      toast({ title: "Processamento em lote iniciado", description: `${files.length} arquivos enviados para classificação.` })
      setFiles([])
    } catch (error) {
      const message = getProcessingErrorMessage(error)
      setUploadError(message)
      toast({
        title: "Erro ao enviar PDFs",
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
        <h1 className="text-2xl font-bold tracking-tight">Separador Contratuais/Demissionais</h1>
        <p className="text-muted-foreground mt-1">
          Identificação automática de tipo de documento (Atestados, Contratos, RG/CPF) e renomeação padronizada.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1 space-y-6">
          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>Classificação em Lote</CardTitle>
              <CardDescription>Envie múltiplos PDFs para organização</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProcess} className="space-y-4">
                <div className="space-y-2">
                  <Label>Arquivos PDF</Label>
                  <div className="border-2 border-dashed border-input rounded-lg p-6 flex flex-col items-center justify-center text-center bg-muted/20 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => document.getElementById('files-upload')?.click()}>
                    <FolderTree className="h-8 w-8 text-muted-foreground mb-2" />
                    {files.length > 0 ? (
                      <div className="text-sm font-medium">{files.length} arquivo(s) selecionado(s)</div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Selecionar vários arquivos</div>
                    )}
                    <input 
                      id="files-upload" 
                      type="file" 
                      accept=".pdf" 
                      multiple
                      className="hidden" 
                      onChange={(e) => {
                        setFiles(Array.from(e.target.files || []))
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
                  disabled={files.length === 0 || uploading}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                  Classificar e Renomear
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card className="md:col-span-2 border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Últimos Arquivos Classificados</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : hrJobs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo Original</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo Detectado</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Baixar lote</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hrJobs.map((job) => (
                    <Fragment key={job.id}>
                    <TableRow>
                      <TableCell className="font-medium max-w-[150px] truncate" title={job.fileName}>
                        {job.fileName}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatDate(job.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs text-primary bg-primary/5">
                          {job.status === 'completed' ? `${job.outputCount} documento(s)` :
                           job.status === 'queued' ? 'Aguardando fila' :
                           'Analisando...'}
                        </Badge>
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
                        <TableCell colSpan={5} className="py-1 text-xs text-destructive">
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
                <FolderTree className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p>Nenhuma classificação recente.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
