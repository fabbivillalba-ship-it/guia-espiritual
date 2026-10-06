import { auth, clerkClient } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

const API_CHECKOUTS = "https://api.lemonsqueezy.com/v1/checkouts";

// Respuesta JSON con código: el PricingModal muestra el campo "message"
const respuesta = (status: number, code: string, message: string) =>
  Response.json({ code, message }, { status });

export async function POST(req: Request) {
  try {
    // 1. Usuario autenticado
    const { userId } = await auth();
    if (!userId) {
      return respuesta(
        401,
        "UNAUTHENTICATED",
        "Inicia sesión o regístrate para elegir un plan."
      );
    }

    // 2. Configuración del servidor
    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    if (!apiKey || !storeId) {
      console.error(
        "[checkout] Falta LEMONSQUEEZY_API_KEY o LEMONSQUEEZY_STORE_ID en .env.local"
      );
      return respuesta(
        500,
        "CONFIG_ERROR",
        "Los pagos no están disponibles por ahora. Inténtalo más tarde."
      );
    }

    // 3. variantId: solo se aceptan las dos variantes de tus planes
    const cuerpo = (await req.json().catch(() => null)) as {
      variantId?: string | number;
    } | null;
    const variantId =
      cuerpo?.variantId !== undefined ? String(cuerpo.variantId) : "";

    const permitidas = [
      process.env.NEXT_PUBLIC_LEMON_VARIANT_PRO,
      process.env.NEXT_PUBLIC_LEMON_VARIANT_ALQUIMIA,
    ].filter((v): v is string => Boolean(v));

    if (!variantId || !permitidas.includes(variantId)) {
      return respuesta(400, "INVALID_VARIANT", "El plan elegido no es válido.");
    }

    // 4. Datos del usuario en Clerk
    const clerk = await clerkClient();
    const usuario = await clerk.users.getUser(userId);

    const email =
      usuario.emailAddresses.find((e) => e.id === usuario.primaryEmailAddressId)
        ?.emailAddress ?? usuario.emailAddresses[0]?.emailAddress;

    // Evita cobrar dos veces a quien ya tiene un plan de pago
    const plan = String(usuario.publicMetadata?.plan ?? "FREE").toUpperCase();
    if (plan === "PRO" || plan === "ALQUIMIA") {
      return respuesta(
        409,
        "ALREADY_SUBSCRIBED",
        "Ya tienes un plan activo. Para cambiarlo o cancelarlo, usa el enlace de gestión del correo de Lemon Squeezy."
      );
    }

    // 5. Crear el checkout en Lemon Squeezy
    const origen = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

    const lemon = await fetch(API_CHECKOUTS, {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              // Se precarga en el formulario de pago
              email,
              // Llega de vuelta en el webhook: meta.custom_data.user_id
              custom: { user_id: userId },
            },
            product_options: {
              redirect_url: `${origen}/?pago=exitoso`,
            },
          },
          relationships: {
            store: { data: { type: "stores", id: storeId } },
            variant: { data: { type: "variants", id: variantId } },
          },
        },
      }),
    });

    if (!lemon.ok) {
      const detalle = await lemon.text();
      console.error("[checkout] Lemon Squeezy respondió", lemon.status, detalle);
      return respuesta(
        502,
        "CHECKOUT_ERROR",
        "No pudimos abrir el pago. Inténtalo de nuevo en un momento."
      );
    }

    const datos = (await lemon.json()) as {
      data?: { attributes?: { url?: string } };
    };
    const url = datos.data?.attributes?.url;

    if (!url) {
      console.error("[checkout] La respuesta de Lemon Squeezy no incluye url:", datos);
      return respuesta(
        502,
        "CHECKOUT_ERROR",
        "No pudimos abrir el pago. Inténtalo de nuevo en un momento."
      );
    }

    return Response.json({ url });
  } catch (error) {
    console.error("[checkout] Error inesperado:", error);
    return respuesta(
      500,
      "SERVER_ERROR",
      "Algo salió mal al preparar el pago. Inténtalo de nuevo."
    );
  }
}
