import { google } from "@ai-sdk/google";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const LIMITE_DIARIO_GRATIS = 3;
// Define cuándo "cambia el día" para el contador. Ajústala a tu público.
const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

const MENSAJE_ERROR =
  "Se interrumpió la conexión por un momento. Respira, y vuelve a intentarlo cuando quieras.";

type Uso = { fecha: string; cantidad: number };

const fechaDeHoy = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const textoError = (e: unknown) => (e instanceof Error ? e.message : String(e));

// El campo "detail" solo se envía en desarrollo, para ver la causa real en pantalla
const respuestaError = (
  status: number,
  code: string,
  message: string,
  detail?: string
) =>
  new Response(
    JSON.stringify({
      code,
      message,
      detail: process.env.NODE_ENV !== "production" ? detail : undefined,
    }),
    {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }
  );

export async function POST(req: Request) {
  try {
    // 1. Usuario autenticado
    const { userId } = await auth();

    if (!userId) {
      // Diagnóstico solo en desarrollo: ¿llegan las cookies de Clerk?
      if (process.env.NODE_ENV !== "production") {
        const cookies = req.headers.get("cookie") ?? "";
        console.warn("[chat][auth] Sin sesión. Diagnóstico:", {
          host: req.headers.get("host"),
          cookie__session: cookies.includes("__session"),
          cookie__client_uat: cookies.includes("__client_uat"),
          cookie__clerk_db_jwt: cookies.includes("__clerk_db_jwt"),
        });
      }
      return new Response("Unauthorized", { status: 401 });
    }

    // 2. Cuerpo de la petición
    const cuerpo = (await req.json()) as { messages?: UIMessage[] };
    const messages = cuerpo.messages ?? [];
    if (messages.length === 0) {
      return respuestaError(400, "BAD_REQUEST", "Mensaje vacío.");
    }

    // 3. Plan del usuario y límite diario para el plan gratuito
    try {
      const clerk = await clerkClient();
      const usuario = await clerk.users.getUser(userId);

      // El webhook de Lemon Squeezy guarda aquí "PRO", "ALQUIMIA" o "FREE"
      const plan = String(usuario.publicMetadata?.plan ?? "FREE").toUpperCase();
      const estado = usuario.publicMetadata?.subscriptionStatus as
        | string
        | undefined;
      const terminaEn = usuario.publicMetadata?.planEndsAt as
        | string
        | null
        | undefined;

      // Una suscripción cancelada conserva el acceso hasta que termina el período pagado
      const planVigente =
        estado !== "cancelled" || !terminaEn || new Date(terminaEn) > new Date();
      const esDePago = (plan === "PRO" || plan === "ALQUIMIA") && planVigente;

      if (!esDePago) {
        const hoy = fechaDeHoy();
        const uso = usuario.privateMetadata?.uso as Uso | undefined;
        const cantidadHoy = uso?.fecha === hoy ? uso.cantidad : 0;

        if (cantidadHoy >= LIMITE_DIARIO_GRATIS) {
          return respuestaError(
            429,
            "LIMIT_REACHED",
            `Has alcanzado tu límite de ${LIMITE_DIARIO_GRATIS} respuestas por hoy en el Plan Gratuito. ¡Pásate al Plan Pro para mensajes ilimitados!`
          );
        }

        await clerk.users.updateUserMetadata(userId, {
          privateMetadata: { uso: { fecha: hoy, cantidad: cantidadHoy + 1 } },
        });
      }
    } catch (error) {
      console.error("[chat][uso] Falló la verificación del plan:", error);
      return respuestaError(500, "USAGE_ERROR", MENSAJE_ERROR, textoError(error));
    }

    // 4. Consulta a Gemini con streaming
    const result = streamText({
      model: google("gemini-2.5-flash"),
      // El AI SDK envía este texto a Gemini como su "systemInstruction"
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      temperature: 0.8,
      onError: ({ error }) => {
        console.error("[chat][stream] Error durante el stream:", error);
      },
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        console.error("[chat][stream] Error enviado al cliente:", error);
        return MENSAJE_ERROR;
      },
    });
  } catch (error) {
    const detalle = textoError(error);
    console.error("[chat] Error en la ruta:", error);
    if (detalle.includes("clerkMiddleware")) {
      console.error(
        "[chat][auth] Clerk no detecta el middleware: revisa que proxy.ts (Next 16) o middleware.ts (Next 15) esté en la raíz."
      );
    }
    return respuestaError(500, "SERVER_ERROR", MENSAJE_ERROR, detalle);
  }
}
