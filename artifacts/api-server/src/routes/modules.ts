import { Router, type IRouter } from "express";
import { ListModulesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/modules", (_req, res): void => {
  res.json(
    ListModulesResponse.parse([
      {
        id: "contracheques",
        name: "Separador de Contracheques",
        description:
          "Separe PDFs consolidados por colaborador e gere arquivos individuais.",
        category: "payroll",
        status: "available",
        route: "/modulos/contracheques",
      },
      {
        id: "folha-de-ponto",
        name: "Renomeador de Folhas de Ponto",
        description:
          "Identifique colaboradores por texto ou OCR e padronize nomes por competência.",
        category: "attendance",
        status: "available",
        route: "/modulos/folha-de-ponto",
      },
      {
        id: "documentos-rh",
        name: "Separador Contratuais/Demissionais",
        description:
          "Classifique documentos, agrupe páginas e organize pastas de colaboradores.",
        category: "hr-documents",
        status: "available",
        route: "/modulos/documentos-rh",
      },
    ]),
  );
});

export default router;