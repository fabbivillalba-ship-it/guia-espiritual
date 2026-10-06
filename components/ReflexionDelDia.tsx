"use client";

import { useEffect, useState } from "react";

interface ReflexionDelDiaProps {
  /** Permite continuar la conversación a partir de la reflexión */
  onConversar: (texto: string) => void;
}

export default function ReflexionDelDia({ onConversar }: ReflexionDelDiaProps) {
  const [contenido, setContenido] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        const res = await fetch("/api/reflection", { cache: "no-store" });
        if (!res.ok) return;
        const datos = (await res.json()) as { contenido?: string };
        if (!cancelado && datos.contenido) setContenido(datos.contenido);
      } catch {
        // Sin reflexión: la tarjeta simplemente no se muestra
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  if (cargando) {
    return (
      <div
        className="w-full max-w-md animate-pulse rounded-3xl border border-amber-200/70 bg-amber-50/60 p-6 dark:border-amber-300/20 dark:bg-amber-500/5"
        aria-label="Cargando la reflexión del día"
      >
        <div className="mx-auto h-3 w-28 rounded-full bg-amber-200/80 dark:bg-amber-300/20" />
        <div className="mt-5 space-y-2">
          <div className="h-3 rounded-full bg-amber-200/60 dark:bg-amber-300/15" />
          <div className="h-3 rounded-full bg-amber-200/60 dark:bg-amber-300/15" />
          <div className="mx-auto h-3 w-2/3 rounded-full bg-amber-200/60 dark:bg-amber-300/15" />
        </div>
      </div>
    );
  }

  if (!contenido) return null;

  return (
    <section className="w-full max-w-md rounded-3xl border border-amber-300/70 bg-amber-50/70 p-6 text-center shadow-[0_0_45px_-20px_rgba(217,170,70,0.5)] dark:border-amber-300/30 dark:bg-amber-500/5">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-800 dark:text-amber-200/80">
        Reflexión del día
      </p>
      <p className="mt-4 whitespace-pre-line font-serif text-base leading-relaxed text-stone-700 dark:text-amber-50/90">
        {contenido}
      </p>
      <button
        type="button"
        onClick={() =>
          onConversar(`Quiero reflexionar contigo sobre esto: "${contenido}"`)
        }
        className="mt-5 rounded-full border border-amber-400/70 px-4 py-2 text-sm text-amber-900 transition hover:bg-amber-100 dark:border-amber-300/40 dark:text-amber-100 dark:hover:bg-amber-500/10"
      >
        Conversar sobre esto
      </button>
    </section>
  );
}
