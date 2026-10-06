import { createHmac, timingSafeEqual } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";

// crypto requiere el runtime de Node; el webhook nunca debe cachearse
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Plan = "PRO" | "ALQUIMIA" | "FREE";

interface EventoLemon {
  meta?: {
    event_name?: string;
    custom_data?: { user_id?: string };
  };
  data?: {
    id?: string;
    attributes?: {
      status?: string;
      variant_id?: number | string;
      customer_id?: number | string;
      ends_at?: string | null;
      renews_at?: string | null;
      updated_at?: string;
    };
  };
}

// Eventos que cambian el estado de una suscripción
const EVENTOS_DE_SUSCRIPCION = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
]);

/* ---------- Firma: HMAC SHA256 en hexadecimal sobre el cuerpo crudo ---------- */
function firmaValida(cuerpo: string, firma: string | null, secreto: string) {
  if (!firma) return false;

  const esperada = Buffer.from(
    createHmac("sha256", secreto).update(cuerpo).digest("hex"),
    "utf8"
  );
  const recibida = Buffer.from(firma, "utf8");

  // timingSafeEqual exige la misma longitud
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/* ---------- Plan que corresponde a la variante comprada ---------- */
function planDeLaVariante(variantId: number | string | undefined): Plan | null {
  const id = String(variantId ?? "");
  if (id && id === process.env.NEXT_PUBLIC_LEMON_VARIANT_PRO) return "PRO";
  if (id && id === process.env.NEXT_PUBLIC_LEMON_VARIANT_ALQUIMIA) return "ALQUIMIA";
  return null;
}

/* ---------- Acceso según el estado de la suscripción ---------- */
function planSegunEstado(
  estado: string | undefined,
  terminaEn: string | null | undefined,
  planDeVariante: Plan | null
): Plan {
  if (!planDeVariante) return "FREE";

  switch (estado) {
    case "active":
    case "on_trial":
    case "past_due": // Lemon Squeezy sigue reintentando el cobro
      return planDeVariante;

    case "cancelled":
      // Cancelada pero con acceso hasta el final del período ya pagado
      return terminaEn && new Date(terminaEn) > new Date()
        ? planDeVariante
        : "FREE";

    default: // expired, unpaid, paused
      return "FREE";
  }
}

export async function POST(req: Request) {
  const secreto = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secreto) {
    console.error("[webhook] Falta LEMONSQUEEZY_WEBHOOK_SECRET en .env.local");
    return new Response("Webhook no configurado", { status: 500 });
  }

  // 1. Cuerpo crudo: la firma se calcula sobre el texto exacto recibido
  const cuerpo = await req.text();

  if (!firmaValida(cuerpo, req.headers.get("x-signature"), secreto)) {
    console.warn("[webhook] Firma inválida: petición rechazada");
    return new Response("Firma inválida", { status: 401 });
  }

  // 2. Interpretar el evento
  let evento: EventoLemon;
  try {
    evento = JSON.parse(cuerpo) as EventoLemon;
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const nombreEvento = evento.meta?.event_name ?? "";
  if (!EVENTOS_DE_SUSCRIPCION.has(nombreEvento)) {
    // Otros eventos (órdenes, facturas...) no cambian el plan
    return Response.json({ ok: true, ignorado: nombreEvento });
  }

  // 3. Usuario de Clerk al que pertenece el pago
  const userId = evento.meta?.custom_data?.user_id;
  if (typeof userId !== "string" || !userId.startsWith("user_")) {
    // Responder 200: reintentar no ayudaría, el evento no trae usuario
    console.error(
      `[webhook] ${nombreEvento} sin custom_data.user_id válido (suscripción ${evento.data?.id})`
    );
    return Response.json({ ok: true, ignorado: "sin user_id" });
  }

  const atributos = evento.data?.attributes ?? {};
  const planDeVariante = planDeLaVariante(atributos.variant_id);
  if (!planDeVariante) {
    console.warn(
      `[webhook] variant_id ${atributos.variant_id} no coincide con NEXT_PUBLIC_LEMON_VARIANT_PRO / _ALQUIMIA`
    );
  }

  const plan = planSegunEstado(atributos.status, atributos.ends_at, planDeVariante);

  // 4. Guardar el estado en Clerk
  try {
    const clerk = await clerkClient();
    const usuario = await clerk.users.getUser(userId);

    // Descarta eventos viejos que lleguen tarde y desordenados
    const previo = usuario.privateMetadata?.lemon as
      | { updatedAt?: string }
      | undefined;
    if (
      previo?.updatedAt &&
      atributos.updated_at &&
      new Date(atributos.updated_at) < new Date(previo.updatedAt)
    ) {
      return Response.json({ ok: true, ignorado: "evento obsoleto" });
    }

    await clerk.users.updateUserMetadata(userId, {
      publicMetadata: {
        plan,
        subscriptionStatus: atributos.status ?? null,
        planEndsAt: atributos.ends_at ?? null,
      },
      privateMetadata: {
        lemon: {
          subscriptionId: evento.data?.id ?? null,
          customerId:
            atributos.customer_id !== undefined
              ? String(atributos.customer_id)
              : null,
          updatedAt: atributos.updated_at ?? null,
        },
      },
    });

    console.log(
      `[webhook] ${nombreEvento}: usuario ${userId} → ${plan} (${atributos.status})`
    );
    return Response.json({ ok: true, plan });
  } catch (error) {
    // Usuario eliminado en Clerk: reintentar no sirve
    if ((error as { status?: number })?.status === 404) {
      console.error(`[webhook] El usuario ${userId} no existe en Clerk`);
      return Response.json({ ok: true, ignorado: "usuario inexistente" });
    }

    // Cualquier otro fallo: 500 para que Lemon Squeezy reintente
    console.error("[webhook] No se pudo actualizar a Clerk:", error);
    return new Response("Error al procesar el evento", { status: 500 });
  }
}
