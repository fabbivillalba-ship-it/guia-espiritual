import { exigirAlquimia } from "@/lib/acceso";
import { borrarConversacion, esUuid, obtenerMensajes } from "@/lib/historial";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

const noEncontrada = () =>
  Response.json(
    { code: "NOT_FOUND", message: "No encontramos esa conversación." },
    { status: 404 }
  );

// GET /api/history/:id → mensajes de una conversación
export async function GET(_req: Request, { params }: Contexto) {
  try {
    const acceso = await exigirAlquimia();
    if (acceso instanceof Response) return acceso;

    const { id } = await params;
    if (!esUuid(id)) return noEncontrada();

    const mensajes = await obtenerMensajes(acceso.userId, id);
    if (!mensajes) return noEncontrada();

    return Response.json({ mensajes });
  } catch (error) {
    console.error("[history/id] Error al leer la conversación:", error);
    return Response.json(
      { code: "SERVER_ERROR", message: "No pudimos abrir la conversación." },
      { status: 500 }
    );
  }
}

// DELETE /api/history/:id → borra la conversación y sus mensajes
export async function DELETE(_req: Request, { params }: Contexto) {
  try {
    const acceso = await exigirAlquimia();
    if (acceso instanceof Response) return acceso;

    const { id } = await params;
    if (!esUuid(id)) return noEncontrada();

    const borrada = await borrarConversacion(acceso.userId, id);
    if (!borrada) return noEncontrada();

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[history/id] Error al borrar la conversación:", error);
    return Response.json(
      { code: "SERVER_ERROR", message: "No pudimos borrar la conversación." },
      { status: 500 }
    );
  }
}
