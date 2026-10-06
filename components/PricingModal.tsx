"use client";

import { useEffect, useRef, useState } from "react";

type PlanId = "pro" | "alquimia";

interface Plan {
  id: PlanId;
  nombre: string;
  etiqueta: string;
  precio: string;
  descripcion: string;
  beneficios: string[];
  variantId: string;
  recomendado?: boolean;
}

/*
  Los variantId se copian desde Lemon Squeezy (Products → tu producto → variante).
  Guárdalos en .env.local con el prefijo NEXT_PUBLIC_ (no son secretos):

    NEXT_PUBLIC_LEMON_VARIANT_PRO=123456
    NEXT_PUBLIC_LEMON_VARIANT_ALQUIMIA=654321

  EDITA los beneficios para que reflejen exactamente lo que ofrece cada plan.
*/
const PLANES: Plan[] = [
  {
    id: "pro",
    nombre: "Conexión Continua",
    etiqueta: "Pro",
    precio: "$9.99",
    descripcion: "Para quien quiere conversar sin límites, cada día.",
    beneficios: [
      "Mensajes ilimitados cada día",
      "Sin esperas por el límite diario",
      "Acceso completo a la guía espiritual",
    ],
    variantId: process.env.NEXT_PUBLIC_LEMON_VARIANT_PRO ?? "",
  },
  {
    id: "alquimia",
    nombre: "Experiencia Sagrada",
    etiqueta: "Alquimia",
    precio: "$14.99",
    descripcion: "La experiencia más profunda, pensada para un camino constante.",
    beneficios: [
      "Todo lo de Conexión Continua",
      "Historial de conversaciones guardado",
      "Acceso anticipado a nuevas funciones",
    ],
    variantId: process.env.NEXT_PUBLIC_LEMON_VARIANT_ALQUIMIA ?? "",
    recomendado: true,
  },
];

interface PricingModalProps {
  open: boolean;
  onClose: () => void;
}

const IconoCheck = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300"
    aria-hidden="true"
  >
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

const IconoCerrar = () => (
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
);

export default function PricingModal({ open, onClose }: PricingModalProps) {
  const [cargando, setCargando] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const botonCerrarRef = useRef<HTMLButtonElement>(null);

  // Cierra con Escape, bloquea el scroll del fondo y enfoca el botón de cerrar
  useEffect(() => {
    if (!open) return;

    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", alPresionar);

    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    botonCerrarRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", alPresionar);
      document.body.style.overflow = overflowPrevio;
    };
  }, [open, onClose]);

  // Si el usuario vuelve atrás desde el checkout, se restablece el botón
  useEffect(() => {
    const alVolver = (e: PageTransitionEvent) => {
      if (e.persisted) setCargando(null);
    };
    window.addEventListener("pageshow", alVolver);
    return () => window.removeEventListener("pageshow", alVolver);
  }, []);

  // Limpia el error cada vez que el modal se abre de nuevo
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const elegirPlan = async (plan: Plan) => {
    if (cargando) return;

    if (!plan.variantId) {
      setError("Este plan aún no está disponible. Inténtalo más tarde.");
      return;
    }

    setError(null);
    setCargando(plan.id);

    try {
      const respuesta = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: plan.variantId }),
      });

      const datos = (await respuesta.json().catch(() => null)) as {
        url?: string;
        message?: string;
      } | null;

      if (respuesta.status === 401) {
        setError("Inicia sesión o regístrate para elegir un plan.");
        setCargando(null);
        return;
      }

      if (!respuesta.ok || !datos?.url) {
        setError(
          datos?.message ?? "No pudimos abrir el pago. Inténtalo de nuevo."
        );
        setCargando(null);
        return;
      }

      // Redirige al checkout de Lemon Squeezy
      window.location.href = datos.url;
    } catch {
      setError("No hay conexión. Revisa tu internet e inténtalo de nuevo.");
      setCargando(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-planes"
    >
      {/* Fondo */}
      <div
        className="absolute inset-0 bg-stone-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-stone-200 bg-stone-50 p-6 shadow-2xl dark:border-stone-800 dark:bg-stone-900 sm:p-10">
        <button
          ref={botonCerrarRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 rounded-full p-2 text-stone-500 transition hover:bg-stone-200 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
        >
          <IconoCerrar />
        </button>

        {/* Encabezado */}
        <div className="flex flex-col items-center text-center">
          <div
            className="h-12 w-12 rounded-full bg-gradient-to-br from-amber-200 to-amber-500/60 blur-[2px] dark:from-amber-300/30 dark:to-amber-600/20"
            aria-hidden="true"
          />
          <h2
            id="titulo-planes"
            className="mt-5 font-serif text-2xl tracking-wide text-amber-900 dark:text-amber-100 sm:text-3xl"
          >
            Profundiza tu conversación
          </h2>
          <p className="mt-3 max-w-md font-serif text-base leading-relaxed text-stone-600 dark:text-stone-400">
            Elige la forma de acompañamiento que resuene contigo. Puedes
            cambiar de camino cuando lo necesites.
          </p>
        </div>

        {/* Tarjetas */}
        <div className="mt-10 grid gap-6 pt-3 sm:grid-cols-2">
          {PLANES.map((plan) => {
            const esteCargando = cargando === plan.id;

            return (
              <article
                key={plan.id}
                className={`relative flex flex-col rounded-3xl border p-6 transition sm:p-7 ${
                  plan.recomendado
                    ? "border-amber-300/80 bg-white shadow-[0_0_45px_-15px_rgba(217,170,70,0.5)] dark:border-amber-300/40 dark:bg-stone-900/60 dark:shadow-[0_0_45px_-15px_rgba(252,211,77,0.25)]"
                    : "border-stone-200 bg-white/70 dark:border-stone-700 dark:bg-stone-900/40"
                }`}
              >
                {plan.recomendado && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 dark:border-amber-300/40 dark:bg-amber-950 dark:text-amber-100">
                    Más Recomendada
                  </span>
                )}

                <header>
                  <h3 className="font-serif text-xl text-stone-800 dark:text-stone-100">
                    {plan.nombre}
                  </h3>
                  <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/80">
                    {plan.etiqueta}
                  </p>
                </header>

                <p className="mt-4 flex items-baseline gap-1.5">
                  <span className="font-serif text-4xl text-stone-900 dark:text-stone-50">
                    {plan.precio}
                  </span>
                  <span className="text-sm text-stone-500 dark:text-stone-400">
                    / mes
                  </span>
                </p>

                <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                  {plan.descripcion}
                </p>

                <ul className="mt-5 flex-1 space-y-2.5 text-sm text-stone-700 dark:text-stone-300">
                  {plan.beneficios.map((beneficio) => (
                    <li key={beneficio} className="flex gap-2.5">
                      <IconoCheck />
                      <span>{beneficio}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => elegirPlan(plan)}
                  disabled={cargando !== null}
                  className={`mt-7 w-full rounded-2xl px-5 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    plan.recomendado
                      ? "bg-amber-700 text-white hover:bg-amber-600 dark:bg-amber-600/80 dark:hover:bg-amber-500/80"
                      : "border border-stone-300 text-stone-700 hover:border-amber-500 hover:text-amber-800 dark:border-stone-600 dark:text-stone-200 dark:hover:border-amber-400/60 dark:hover:text-amber-200"
                  }`}
                >
                  {esteCargando ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
                      Abriendo el pago...
                    </span>
                  ) : (
                    `Elegir ${plan.etiqueta}`
                  )}
                </button>
              </article>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <p
            role="alert"
            className="mt-6 text-center text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}

        <p className="mt-6 text-center text-xs text-stone-500 dark:text-stone-500">
          Serás llevado a la página de pago segura de Lemon Squeezy.
        </p>
      </div>
    </div>
  );
}
