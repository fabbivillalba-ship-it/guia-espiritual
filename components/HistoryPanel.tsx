"use client";

import { useCallback, useEffect, useState } from "react";

interface ConversacionResumen {
  id: string;
  title: string;
  updated_at: string;
}

export interface MensajeHistorial {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface HistoryPanelProps {
  open: boolean;
  onClose: () => void;
  /** Conversación abierta actualmente (para resaltarla y saber si se borra) */
  conversacionActualId: string | null;
  /** El usuario eligió una conversación pasada */
  onAbrir: (id: string, mensajes: MensajeHistorial[]) => void;
  /** El usuario quiere empezar una conversación nueva */
  onNueva: () => void;
}

const formatearFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function HistoryPanel({
  open,
  onClose,
  conversacionActualId,
  onAbrir,
  onNueva,
}: HistoryPanelProps) {
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[]>([]);
  const [cargando, setCargando] = useState(false);
  const [abriendoId, setAbriendoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargarLista = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/history", { cache: "no-store" });
      const datos = (await res.json().catch(() => null)) as {
        conversaciones?: ConversacionResumen[];
        message?: string;
      } | null;

      if (!res.ok) {
        setError(datos?.message ?? "No pudimos cargar tu historial.");
        return;
      }
      setConversaciones(datos?.conversaciones ?? []);
    } catch {
      setError("No hay conexión. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setCargando(false);
    }
  }, []);

  // Recarga la lista cada vez que se abre el panel
  useEffect(() => {
    if (open) void cargarLista();
  }, [open, cargarLista]);

  // Cierra con Escape
  useEffect(() => {
    if (!open) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", alPresionar);
    return () => document.removeEventListener("keydown", alPresionar);
  }, [open, onClose]);

  const abrir = async (id: string) => {
    if (abriendoId) return;
    setAbriendoId(id);
    setError(null);
    try {
      const res = await fetch(`/api/history/${id}`, { cache: "no-store" });
      const datos = (await res.json().catch(() => null)) as {
        mensajes?: MensajeHistorial[];
        message?: string;
      } | null;

      if (!res.ok || !datos?.mensajes) {
        setError(datos?.message ?? "No pudimos abrir la conversación.");
        return;
      }
      onAbrir(id, datos.mensajes);
      onClose();
    } catch {
      setError("No hay conexión. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setAbriendoId(null);
    }
  };

  const borrar = async (id: string) => {
    if (!window.confirm("¿Borrar esta conversación? No se puede deshacer.")) return;
    setError(null);
    try {
      const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const datos = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(datos?.message ?? "No pudimos borrar la conversación.");
        return;
      }
      setConversaciones((lista) => lista.filter((c) => c.id !== id));
      if (id === conversacionActualId) onNueva();
    } catch {
      setError("No hay conexión. Revisa tu internet e inténtalo de nuevo.");
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-historial"
    >
      <div
        className="absolute inset-0 bg-stone-950/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className="relative flex h-full w-full max-w-sm flex-col border-l border-stone-200 bg-stone-50 shadow-2xl dark:border-stone-800 dark:bg-stone-900">
        <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-800">
          <h2
            id="titulo-historial"
            className="font-serif text-lg text-amber-900 dark:text-amber-100"
          >
            Tus conversaciones
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar historial"
            className="rounded-full p-2 text-stone-500 transition hover:bg-stone-200 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="px-5 pt-4">
          <button
            type="button"
            onClick={() => {
              onNueva();
              onClose();
            }}
            className="w-full rounded-2xl bg-amber-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-600 dark:bg-amber-600/80 dark:hover:bg-amber-500/80"
          >
            Nueva conversación
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto px-3 pb-6">
          {cargando && (
            <p className="px-2 py-6 text-center text-sm text-stone-500 dark:text-stone-400">
              Cargando...
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="px-2 py-4 text-center text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </p>
          )}

          {!cargando && !error && conversaciones.length === 0 && (
            <p className="px-4 py-8 text-center font-serif text-sm leading-relaxed text-stone-500 dark:text-stone-400">
              Aún no hay conversaciones guardadas. Las nuevas aparecerán aquí
              automáticamente.
            </p>
          )}

          <ul className="space-y-1">
            {conversaciones.map((c) => {
              const activa = c.id === conversacionActualId;
              return (
                <li key={c.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => abrir(c.id)}
                    disabled={abriendoId !== null}
                    className={`w-full rounded-xl px-3 py-3 pr-11 text-left transition disabled:opacity-60 ${
                      activa
                        ? "bg-amber-100 dark:bg-amber-500/15"
                        : "hover:bg-stone-200/70 dark:hover:bg-stone-800"
                    }`}
                  >
                    <span className="block truncate text-sm text-stone-800 dark:text-stone-100">
                      {abriendoId === c.id ? "Abriendo..." : c.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-stone-500 dark:text-stone-400">
                      {formatearFecha(c.updated_at)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => borrar(c.id)}
                    aria-label={`Borrar conversación: ${c.title}`}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-stone-400 opacity-100 transition hover:bg-stone-200 hover:text-red-600 dark:hover:bg-stone-700 dark:hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
