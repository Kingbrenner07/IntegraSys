import { Fragment, useState } from "react"
import { getListProcessingJobsQueryKey, useListProcessingJobs } from "@workspace/api-client-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils"
import { Upload, FileText, Loader2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { ProcessingActions } from "@/components/processing-actions"
import { getProcessingErrorMessage, uploadProcessingFile } from "@/lib/processing"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CircleAlert } from "lucide-react"

export default function PayslipModule() {
  const { toast } = useToast()
  
  const { data: jobs, isLoading } = useListProcessingJobs({
    query: { queryKey: getListProcessingJobsQueryKey(), refetchInterval: 2000 },
  })

  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  
  // Filter jobs by this module
  const payslipJobs = jobs?.filter(j => j.moduleId === 'payroll') || []

  const handleProcess = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      toast({ title: "Selecione um arquivo", variant: "destructive" })
      return
    }

    setUploadError(null)
    setUploading(true)
    try {
      await uploadProcessingFile({ file, moduleId: "payroll" })
      toast({ title: "Processamento iniciado", description: `Arquivo ${file.name} enfileirado.` })
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
    <div className="space-y-7">
      <div>
        <div className="mb-2 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary/80">Módulo de processamento</div>
        <h1 className="text-[1.7rem] font-bold tracking-[-0.04em] sm:text-3xl">Separação de Contracheques</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Divida PDFs consolidados da folha de pagamento em arquivos individuais por funcionário.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1 space-y-6">
          <Card className="border-card-border/80">
            <CardHeader>
              <CardTitle>Novo Processamento</CardTitle>
              <CardDescription>Faça upload do PDF consolidado</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProcess} className="space-y-4">
                <div className="space-y-2">
                  <Label>Arquivo PDF</Label>
                  <div className="border-2 border-dashed border-input rounded-lg p-6 flex flex-col items-center justify-center text-center bg-muted/20 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => document.getElementById('file-upload')?.click()}>
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    {file ? (
                      <div className="text-sm font-medium truncate max-w-full px-4">{file.name}</div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Clique para selecionar ou arraste o arquivo</div>
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
                  disabled={!file || uploading}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
                  Extrair Documentos
                </Button>
              </form>
            </CardContent>
          </Card>

        </div>

        <Card className="md:col-span-2 border-card-border/80">
          <CardHeader>
            <CardTitle>Histórico de Processamento</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : payslipJobs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Progresso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Baixar lote</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payslipJobs.map((job) => (
                    <Fragment key={job.id}>
                    <TableRow>
                      <TableCell className="font-medium max-w-[200px] truncate" title={job.fileName}>
                        {job.fileName}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatDate(job.createdAt)}
                      </TableCell>
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
                <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p>Nenhum processamento recente encontrado.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
