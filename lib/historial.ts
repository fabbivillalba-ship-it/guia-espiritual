import { getSupabase } from "@/lib/supabase";

export interface ConversacionResumen {
  id: string;
  title: string;
  updated_at: string;
}

export interface MensajeGuardado {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export const esUuid = (valor: unknown): valor is string =>
  typeof valor === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);

const crearTitulo = (texto: string) => {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return "Nueva conversación";
  return limpio.length > 60 ? `${limpio.slice(0, 57)}...` : limpio;
};

/** Devuelve true si la conversación existe y es de este usuario (la crea si no existe). */
export async function asegurarConversacion(
  userId: string,
  conversationId: string,
  primerTexto: string
): Promise<boolean> {
  const db = getSupabase();

  const { data: existente, error: errorLectura } = await db
    .from("conversations")
    .select("user_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (errorLectura) throw errorLectura;
  if (existente) return existente.user_id === userId;

  const { error } = await db.from("conversations").insert({
    id: conversationId,
    user_id: userId,
    title: crearTitulo(primerTexto),
  });

  if (error) {
    // Posible carrera (dos peticiones creándola a la vez): se vuelve a comprobar
    const { data: creada } = await db
      .from("conversations")
      .select("user_id")
      .eq("id", conversationId)
      .maybeSingle();
    return creada?.user_id === userId;
  }
  return true;
}

export async function guardarMensaje(
  userId: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string
) {
  const db = getSupabase();

  const { error } = await db.from("messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role,
    content,
  });
  if (error) throw error;

  await db
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", userId);
}

export async function listarConversaciones(
  userId: string,
  limite = 50
): Promise<ConversacionResumen[]> {
  const { data, error } = await getSupabase()
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as ConversacionResumen[];
}

/** Mensajes de una conversación, solo si pertenece al usuario. Devuelve null si no existe. */
export async function obtenerMensajes(
  userId: string,
  conversationId: string
): Promise<MensajeGuardado[] | null> {
  const db = getSupabase();

  const { data: conversacion, error: errorConversacion } = await db
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (errorConversacion) throw errorConversacion;
  if (!conversacion) return null;

  const { data, error } = await db
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MensajeGuardado[];
}

/** Borra la conversación (y sus mensajes, por ON DELETE CASCADE). Devuelve false si no era suya. */
export async function borrarConversacion(
  userId: string,
  conversationId: string
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", userId)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
