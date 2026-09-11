import { AlertCircle } from "lucide-react"

// Generic not found page
export default function NotFound() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center text-center p-8">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight mb-2">Página não encontrada</h2>
      <p className="text-muted-foreground max-w-md">
        A página que você está procurando não existe ou você não tem permissão para acessá-la.
      </p>
    </div>
  )
}
