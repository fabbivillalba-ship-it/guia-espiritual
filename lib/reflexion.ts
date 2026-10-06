import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { getSupabase } from "@/lib/supabase";

/**
 * Devuelve la reflexión del día. Si todavía no existe, la genera con Gemini y la guarda,
 * así todos los usuarios Alquimia leen la misma reflexión durante todo el día.
 */
export async function reflexionDelDia(fecha: string): Promise<string> {
  const db = getSupabase();

  const { data: existente } = await db
    .from("daily_reflections")
    .select("content")
    .eq("date", fecha)
    .maybeSingle();
  if (existente?.content) return existente.content as string;

  const { text } = await generateText({
    model: google("gemini-2.5-flash"),
    system: SYSTEM_PROMPT,
    prompt:
      `Escribe la Reflexión del Día para el ${fecha}. ` +
      "Entre 70 y 100 palabras, sobre un solo tema (elige uno distinto cada día: amor y miedo, " +
      "creación de la realidad, unidad, propósito, aceptación). Tono cálido, claro y cotidiano, " +
      "sin títulos ni listas, y termina con una pregunta introspectiva que devuelva el poder " +
      "a quien lee. Responde solo con el texto de la reflexión.",
    temperature: 0.9,
  });

  const contenido = text.trim();
  if (!contenido) throw new Error("Gemini devolvió una reflexión vacía");

  // Si otra petición se adelantó, se conserva la primera
  await db
    .from("daily_reflections")
    .upsert({ date: fecha, content: contenido }, { onConflict: "date", ignoreDuplicates: true });

  const { data: final } = await db
    .from("daily_reflections")
    .select("content")
    .eq("date", fecha)
    .maybeSingle();

  return (final?.content as string | undefined) ?? contenido;
}
