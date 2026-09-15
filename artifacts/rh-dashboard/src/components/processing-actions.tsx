import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListProcessingJobsQueryKey,
  useCancelProcessingJob,
} from "@workspace/api-client-react";
import { Ban, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  downloadProcessingFile,
} from "@/lib/processing";

export function ProcessingActions({
  jobId,
  status,
}: {
  jobId: number;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = useState<string | null>(null);
  const cancelJob = useCancelProcessingJob({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: getListProcessingJobsQueryKey(),
        });
        toast({
          title: "Processamento cancelado",
          description: "A tarefa foi interrompida e a próxima da fila poderá iniciar.",
        });
      },
      onError: (error) => {
        toast({
          title: "Não foi possível cancelar",
          description:
            error instanceof Error ? error.message : "Tente novamente em instantes.",
          variant: "destructive",
        });
      },
    },
  });

  async function download(key: string, outputId?: number) {
    setDownloading(key);
    try {
      await downloadProcessingFile(jobId, outputId);
    } catch (error) {
      toast({
        title: "Download indisponível",
        description:
          error instanceof Error ? error.message : "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setDownloading(null);
    }
  }

  if (status === "queued" || status === "processing") {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={cancelJob.isPending}
          >
            {cancelJob.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Ban className="h-3.5 w-3.5" />
            )}
            Cancelar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este processamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo deixará a fila ou terá a análise interrompida. Essa ação
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelJob.mutate({ jobId })}
            >
              Cancelar processamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (status !== "completed") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void download("zip")}
        disabled={downloading !== null}
        title="Baixar todos os arquivos em ZIP"
        aria-label="Baixar todos os arquivos em ZIP"
      >
        {downloading === "zip" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Package className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}