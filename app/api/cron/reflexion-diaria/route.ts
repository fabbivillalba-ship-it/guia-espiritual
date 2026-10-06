import { fechaDeHoy } from "@/lib/acceso";
import { reflexionDelDia } from "@/lib/reflexion";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Vercel Cron llama a esta ruta cada día (ver vercel.json) y envía
// "Authorization: Bearer <CRON_SECRET>". Pre-genera la reflexión del día
// para que el primer usuario no tenga que esperarla.
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new Response("No autorizado", { status: 401 });
  }

  try {
    const fecha = fechaDeHoy();
    const contenido = await reflexionDelDia(fecha);
    return Response.json({
      ok: true,
      fecha,
      palabras: contenido.split(/\s+/).length,
    });
  } catch (error) {
    console.error("[cron] No se pudo generar la reflexión diaria:", error);
    return new Response("Error al generar la reflexión", { status: 500 });
  }
}
