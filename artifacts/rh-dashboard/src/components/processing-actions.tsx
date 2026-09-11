import { useState } from "react";
import { Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  downloadProcessingFile,
} from "@/lib/processing";

export function ProcessingActions({
  jobId,
  completed,
}: {
  jobId: number;
  completed: boolean;
}) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState<string | null>(null);

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

  if (!completed) return <span className="text-xs text-muted-foreground">Aguardando</span>;

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