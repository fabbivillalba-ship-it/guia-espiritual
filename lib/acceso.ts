import { auth, clerkClient } from "@clerk/nextjs/server";

export type Plan = "FREE" | "PRO" | "ALQUIMIA";

// Define cuándo "cambia el día" (contador diario y reflexión del día)
export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

// Fecha de hoy como "2026-10-06" en la zona horaria elegida
export const fechaDeHoy = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/**
 * Plan con acceso real, a partir de los metadatos públicos que guarda el webhook.
 * Una suscripción cancelada conserva el acceso hasta que termina el período pagado.
 */
export function planEfectivo(metadata: Record<string, unknown> | undefined): Plan {
  const plan = String(metadata?.plan ?? "FREE").toUpperCase();
  if (plan !== "PRO" && plan !== "ALQUIMIA") return "FREE";

  const estado = metadata?.subscriptionStatus as string | undefined;
  const terminaEn = metadata?.planEndsAt as string | null | undefined;
  const vigente =
    estado !== "cancelled" || !terminaEn || new Date(terminaEn) > new Date();

  return vigente ? plan : "FREE";
}

/**
 * Para rutas exclusivas del plan Alquimia.
 * Devuelve { userId } si todo está bien, o una Response de error lista para retornar:
 *   const acceso = await exigirAlquimia();
 *   if (acceso instanceof Response) return acceso;
 */
export async function exigirAlquimia(): Promise<{ userId: string } | Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { code: "UNAUTHENTICATED", message: "Inicia sesión para continuar." },
      { status: 401 }
    );
  }

  const clerk = await clerkClient();
  const usuario = await clerk.users.getUser(userId);

  if (planEfectivo(usuario.publicMetadata) !== "ALQUIMIA") {
    return Response.json(
      {
        code: "ALQUIMIA_REQUIRED",
        message:
          "Esta función es exclusiva del plan Experiencia Sagrada (Alquimia).",
      },
      { status: 403 }
    );
  }

  return { userId };
}
