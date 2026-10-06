import { exigirAlquimia } from "@/lib/acceso";
import { listarConversaciones } from "@/lib/historial";

export const dynamic = "force-dynamic";

// GET /api/history → conversaciones pasadas del usuario autenticado (solo plan Alquimia)
export async function GET() {
  try {
    const acceso = await exigirAlquimia();
    if (acceso instanceof Response) return acceso;

    const conversaciones = await listarConversaciones(acceso.userId);
    return Response.json({ conversaciones });
  } catch (error) {
    console.error("[history] Error al listar conversaciones:", error);
    return Response.json(
      { code: "SERVER_ERROR", message: "No pudimos cargar tu historial." },
      { status: 500 }
    );
  }
}
