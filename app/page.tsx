"use client";

import { useChat } from "@ai-sdk/react";
import {
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/nextjs";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import PricingModal from "@/components/PricingModal";
import HistoryPanel, { type MensajeHistorial } from "@/components/HistoryPanel";
import ReflexionDelDia from "@/components/ReflexionDelDia";

// Tipo deducido de las props de ReactMarkdown: funciona en cualquier versión
type MarkdownComponents = NonNullable<
  ComponentProps<typeof ReactMarkdown>["components"]
>;

const SUGERENCIAS = [
  "¿Cómo elijo desde el amor y no desde el miedo?",
  "Siento que no tengo propósito. ¿Qué me dices?",
  "¿Por qué existe el sufrimiento?",
];

/* ---------- Errores de la API (401 / 429 / 500) ---------- */
const LIMITE_DIARIO_GRATIS = 3;

type DetalleError = { codigo: string; mensaje: string; detalle?: string };

const MENSAJE_GENERICO = "Algo interrumpió la conversación. Inténtalo de nuevo.";

// Los mensajes viven en el cliente: así se ven bien aunque el servidor cambie el texto
const MENSAJES_API: Record<string, string> = {
  UNAUTHENTICATED:
    "Por favor, inicia sesión o regístrate para conversar con la guía espiritual.",
  LIMIT_REACHED: `Has alcanzado tu límite de ${LIMITE_DIARIO_GRATIS} respuestas por hoy en el Plan Gratuito. ¡Pásate al Plan Pro para mensajes ilimitados!`,
};

const interpretarError = (error: Error): DetalleError => {
  // Respuestas HTTP de error: el servidor envía JSON { code, message, detail? }
  try {
    const datos = JSON.parse(error.message) as {
      code?: string;
      message?: string;
      detail?: string;
    };
    if (datos.code) {
      return {
        codigo: datos.code,
        mensaje: MENSAJES_API[datos.code] ?? datos.message ?? MENSAJE_GENERICO,
        detalle: datos.detail,
      };
    }
  } catch {
    // No es JSON: puede ser un error del stream (texto plano)
  }
  return {
    codigo: "UNKNOWN",
    mensaje:
      error.message && error.message.length < 200
        ? error.message
        : MENSAJE_GENERICO,
  };
};

/* ---------- Configuración de voz ---------- */
const IDIOMA_DICTADO = "es-AR";

const MENSAJES_ERROR_VOZ: Record<string, string> = {
  "not-allowed":
    "Permiso de micrófono denegado. Haz clic en el candado de la barra de direcciones y permite el micrófono.",
  "service-not-allowed":
    "El navegador bloqueó el reconocimiento de voz. Revisa los permisos del sitio.",
  "audio-capture":
    "No se detectó ningún micrófono. Conecta uno y vuelve a intentarlo.",
  "language-not-supported":
    "El navegador no soporta dictado en este idioma.",
  "no-support":
    "Tu navegador no soporta dictado por voz. Usa Google Chrome, Edge o Safari.",
  insecure: "El micrófono solo funciona en HTTPS o en localhost.",
  offline: "No hay conexión a internet. El dictado la necesita.",
  "network-brave":
    "Brave bloquea el servicio de voz de Google. Prueba en Google Chrome o Edge.",
  network:
    "El navegador no pudo conectarse al servicio de voz. Prueba en Google Chrome o Edge, y desactiva VPN o bloqueadores si los usas.",
};

/* ---------- Tipos mínimos para SpeechRecognition ---------- */
type EventoReconocimiento = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

interface Reconocimiento {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoReconocimiento) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type ConstructorReconocimiento = new () => Reconocimiento;

const obtenerReconocimiento = (): ConstructorReconocimiento | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: ConstructorReconocimiento;
    webkitSpeechRecognition?: ConstructorReconocimiento;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/* ---------- Utilidades de texto para la lectura en voz alta ---------- */
const limpiarMarkdown = (texto: string) =>
  texto
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/(\*\*|__|\*|~~)/g, "")
    .trim();

// Divide en fragmentos cortos: evita el corte de Chrome en lecturas largas
const dividirEnFragmentos = (texto: string, max = 200) => {
  const frases = texto
    .split(/(?<=[.!?…:])\s+|\n+/)
    .map((f) => f.trim())
    .filter(Boolean);

  const fragmentos: string[] = [];
  let actual = "";
  for (const frase of frases) {
    if ((actual + " " + frase).trim().length > max && actual) {
      fragmentos.push(actual);
      actual = frase;
    } else {
      actual = (actual + " " + frase).trim();
    }
  }
  if (actual) fragmentos.push(actual);
  return fragmentos;
};

/* ---------- Iconos ---------- */
const IconoMic = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </svg>
);

const IconoParlante = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M11 5 6 9H3v6h3l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
);

const IconoStop = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

/* ---------- Estilos Markdown ---------- */
const markdownComponents: MarkdownComponents = {
  p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
  h1: ({ children }) => (
    <h1 className="mb-3 mt-6 font-serif text-2xl text-amber-800 first:mt-0 dark:text-amber-200">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-6 font-serif text-xl text-amber-800 first:mt-0 dark:text-amber-200">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-5 font-serif text-lg text-amber-800 first:mt-0 dark:text-amber-200">
      {children}
    </h3>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-stone-900 dark:text-amber-100">
      {children}
    </strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-4 list-disc space-y-1 pl-6 marker:text-amber-600/70 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-4 list-decimal space-y-1 pl-6 marker:text-amber-600/70 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-amber-500/60 pl-4 italic text-stone-600 dark:text-stone-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-stone-300 dark:border-stone-700" />,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-amber-700 underline underline-offset-2 hover:text-amber-600 dark:text-amber-300 dark:hover:text-amber-200"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) =>
    className ? (
      <code className={`${className} font-mono text-sm`}>{children}</code>
    ) : (
      <code className="rounded bg-stone-200 px-1.5 py-0.5 font-mono text-sm dark:bg-stone-800">
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-xl bg-stone-200 p-4 dark:bg-stone-900">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-stone-300 px-3 py-2 text-left font-semibold dark:border-stone-700">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-stone-200 px-3 py-2 dark:border-stone-800">
      {children}
    </td>
  ),
};

/* ---------- Componente principal ---------- */
export default function ChatPage() {
  const { messages, sendMessage, setMessages, stop, status, error } = useChat();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  // Funciones exclusivas del plan Alquimia (el servidor vuelve a validarlo siempre)
  const esAlquimia =
    String(user?.publicMetadata?.plan ?? "").toUpperCase() === "ALQUIMIA";
  const [input, setInput] = useState("");
  const [verPlanes, setVerPlanes] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Voz
  const [soporteVerificado, setSoporteVerificado] = useState(false);
  const [dictadoSoportado, setDictadoSoportado] = useState(false);
  const [lecturaSoportada, setLecturaSoportada] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [hablandoId, setHablandoId] = useState<string | null>(null);
  const [errorVoz, setErrorVoz] = useState<string | null>(null);

  const reconocimientoRef = useRef<Reconocimiento | null>(null);
  const textoBaseRef = useRef("");
  const vozRef = useRef<SpeechSynthesisVoice | null>(null);
  const tokenLecturaRef = useRef(0);

  const isLoading = status === "submitted" || status === "streaming";

  // Estado de acceso: sin sesión o con el límite diario alcanzado
  const detalleError = error ? interpretarError(error) : null;
  const sinSesion = isLoaded && !isSignedIn;
  const limiteAlcanzado = detalleError?.codigo === "LIMIT_REACHED";
  const chatBloqueado = !isLoaded || !isSignedIn || limiteAlcanzado;

  // Detección de soporte + selección de voz en español
  useEffect(() => {
    setDictadoSoportado(obtenerReconocimiento() !== null);
    setSoporteVerificado(true);

    if (!("speechSynthesis" in window)) return;
    setLecturaSoportada(true);
    const synth = window.speechSynthesis;

    const elegirVoz = () => {
      const idiomaNavegador = navigator.language.toLowerCase();
      const puntaje = (v: SpeechSynthesisVoice) =>
        (/natural|neural|online|google/i.test(v.name) ? 2 : 0) +
        (v.lang.toLowerCase() === idiomaNavegador ? 1 : 0);

      const espanolas = synth
        .getVoices()
        .filter((v) => v.lang.toLowerCase().startsWith("es"))
        .sort((a, b) => puntaje(b) - puntaje(a));

      vozRef.current = espanolas[0] ?? null;
    };

    elegirVoz();
    synth.addEventListener("voiceschanged", elegirVoz);

    return () => {
      synth.removeEventListener("voiceschanged", elegirVoz);
      synth.cancel();
      reconocimientoRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  /* ----- Salida por voz ----- */
  const detenerLectura = () => {
    tokenLecturaRef.current++;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setHablandoId(null);
  };

  const alternarLectura = (id: string, markdown: string) => {
    if (!lecturaSoportada) return;
    if (hablandoId === id) {
      detenerLectura();
      return;
    }

    detenerLectura();
    const fragmentos = dividirEnFragmentos(limpiarMarkdown(markdown));
    if (fragmentos.length === 0) return;

    const token = tokenLecturaRef.current;
    setHablandoId(id);

    fragmentos.forEach((fragmento, i) => {
      const u = new SpeechSynthesisUtterance(fragmento);
      u.voice = vozRef.current;
      u.lang = vozRef.current?.lang ?? "es-ES";
      u.rate = 0.88; // pausado
      u.pitch = 0.9; // tono grave y sereno
      u.volume = 1;

      const alTerminar = () => {
        if (tokenLecturaRef.current === token && i === fragmentos.length - 1) {
          setHablandoId(null);
        }
      };
      u.onend = alTerminar;
      u.onerror = alTerminar;

      window.speechSynthesis.speak(u);
    });
  };

  /* ----- Entrada por voz ----- */
  const detenerDictado = () => {
    reconocimientoRef.current?.stop();
    setEscuchando(false);
  };

  const iniciarDictado = async (esReintento = false) => {
    const Constructor = obtenerReconocimiento();
    if (!Constructor) {
      setErrorVoz(MENSAJES_ERROR_VOZ["no-support"]);
      return;
    }
    if (!window.isSecureContext) {
      setErrorVoz(MENSAJES_ERROR_VOZ["insecure"]);
      return;
    }
    if (!navigator.onLine) {
      setErrorVoz(MENSAJES_ERROR_VOZ["offline"]);
      return;
    }

    detenerLectura();
    setErrorVoz(null);

    // Verifica el permiso del micrófono antes de arrancar, para dar un error claro
    if (!esReintento) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((t) => t.stop());
      } catch (e) {
        const nombre = e instanceof DOMException ? e.name : "";
        setErrorVoz(
          nombre === "NotFoundError"
            ? MENSAJES_ERROR_VOZ["audio-capture"]
            : MENSAJES_ERROR_VOZ["not-allowed"]
        );
        return;
      }
      textoBaseRef.current = input;
    }

    const rec = new Constructor();
    rec.lang = IDIOMA_DICTADO;
    rec.continuous = false;
    rec.interimResults = true;

    // Carga el texto transcrito directamente en el input del chat
    rec.onresult = (e) => {
      let transcripcion = "";
      for (let i = 0; i < e.results.length; i++) {
        transcripcion += e.results[i][0].transcript;
      }
      setInput((textoBaseRef.current + " " + transcripcion).trim());
    };

    rec.onerror = (e) => {
      // Errores sin importancia: silencio o cancelación manual
      if (e.error === "no-speech" || e.error === "aborted") {
        setEscuchando(false);
        return;
      }

      // Un fallo de red puede ser pasajero: se reintenta una sola vez
      if (e.error === "network" && !esReintento) {
        setTimeout(() => void iniciarDictado(true), 400);
        return;
      }

      if (e.error === "network") {
        const esBrave = "brave" in navigator;
        setErrorVoz(
          esBrave
            ? MENSAJES_ERROR_VOZ["network-brave"]
            : MENSAJES_ERROR_VOZ["network"]
        );
      } else {
        setErrorVoz(
          MENSAJES_ERROR_VOZ[e.error] ??
            `Error de reconocimiento de voz (${e.error}).`
        );
      }
      setEscuchando(false);
    };

    rec.onend = () => {
      // Evita que el "end" de un intento viejo apague uno nuevo
      if (reconocimientoRef.current === rec) setEscuchando(false);
    };

    reconocimientoRef.current = rec;
    try {
      rec.start();
      setEscuchando(true);
    } catch {
      setEscuchando(false);
      setErrorVoz("No se pudo iniciar el micrófono. Inténtalo de nuevo.");
    }
  };

  const alternarDictado = () => {
    if (escuchando) detenerDictado();
    else if (!chatBloqueado) void iniciarDictado();
  };

  /* ----- Envío ----- */
  const enviar = (texto: string) => {
    const limpio = texto.trim();
    if (!limpio || isLoading || chatBloqueado) return;
    if (escuchando) {
      reconocimientoRef.current?.abort();
      setEscuchando(false);
    }
    detenerLectura();
    setErrorVoz(null);

    // Plan Alquimia: cada hilo de chat tiene un id que el servidor usa para guardarlo
    let idConversacion = conversationId;
    if (esAlquimia && !idConversacion) {
      idConversacion = crypto.randomUUID();
      setConversationId(idConversacion);
    }

    sendMessage(
      { text: limpio },
      esAlquimia && idConversacion
        ? { body: { conversationId: idConversacion } }
        : undefined
    );
    setInput("");
  };

  /* ----- Historial (plan Alquimia) ----- */
  const abrirHistorial = () => {
    if (esAlquimia) setVerHistorial(true);
    else setVerPlanes(true); // el resto de usuarios ve los planes
  };

  const nuevaConversacion = () => {
    if (isLoading) stop();
    detenerLectura();
    setMessages([]);
    setConversationId(null);
    setInput("");
  };

  const abrirConversacion = (id: string, mensajes: MensajeHistorial[]) => {
    if (isLoading) stop();
    detenerLectura();
    setMessages(
      mensajes.map((m) => ({
        id: m.id,
        role: m.role,
        parts: [{ type: "text" as const, text: m.content }],
      }))
    );
    setConversationId(id);
  };

  const ultimoId = messages[messages.length - 1]?.id;

  return (
    <main className="flex h-dvh flex-col bg-stone-50 text-stone-800 dark:bg-stone-950 dark:text-stone-200">
      {/* Encabezado */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-stone-200 px-4 py-5 dark:border-stone-800 sm:px-6">
        <div className="flex min-w-0 items-center justify-start gap-2">
          <button
            type="button"
            onClick={abrirHistorial}
            aria-label="Historial de conversaciones"
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-2.5 py-1.5 text-sm text-stone-600 transition hover:border-amber-500 hover:text-amber-800 dark:border-stone-700 dark:text-stone-400 dark:hover:border-amber-400/60 dark:hover:text-amber-200 sm:px-3"
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
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <span className="hidden sm:inline">Historial</span>
          </button>
          <button
            type="button"
            onClick={() => setVerPlanes(true)}
            className="rounded-full border border-amber-300/70 px-3 py-1.5 text-sm text-amber-800 transition hover:border-amber-500 hover:bg-amber-50 dark:border-amber-300/30 dark:text-amber-200 dark:hover:border-amber-300/60 dark:hover:bg-amber-500/10"
          >
            Planes
          </button>
        </div>

        <div className="text-center">
          <h1 className="font-serif text-xl tracking-wide text-amber-800 dark:text-amber-200/90">
            Guía Espiritual
          </h1>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Una conversación contigo mismo
          </p>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          {isLoaded && !isSignedIn && (
            <>
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="rounded-full px-3 py-1.5 text-sm text-stone-600 transition hover:text-amber-800 dark:text-stone-400 dark:hover:text-amber-200"
                >
                  Iniciar sesión
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="hidden rounded-full bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-600 dark:bg-amber-600/80 dark:hover:bg-amber-500/80 sm:inline-block"
                >
                  Registrarse
                </button>
              </SignUpButton>
            </>
          )}
          {isLoaded && isSignedIn && <UserButton />}
        </div>
      </header>

      {/* Aviso: usuario sin sesión */}
      {sinSesion && (
        <div
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-400/20 dark:bg-amber-500/10"
        >
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
            <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-100">
              Por favor, inicia sesión o regístrate para conversar con la guía
              espiritual.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="rounded-full bg-amber-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 dark:bg-amber-600/80 dark:hover:bg-amber-500/80"
                >
                  Iniciar sesión
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="rounded-full border border-amber-700/40 px-4 py-2 text-sm text-amber-900 transition hover:bg-amber-100 dark:border-amber-300/30 dark:text-amber-100 dark:hover:bg-amber-500/10"
                >
                  Registrarse
                </button>
              </SignUpButton>
            </div>
          </div>
        </div>
      )}

      {/* Mensajes */}
      <section className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          {messages.length === 0 && (
            <div className="mt-16 flex flex-col items-center gap-6 text-center">
              <div className="h-16 w-16 animate-pulse rounded-full bg-gradient-to-br from-amber-200 to-amber-500/60 blur-sm dark:from-amber-300/30 dark:to-amber-600/20" />
              <p className="max-w-md font-serif text-lg leading-relaxed text-stone-600 dark:text-stone-400">
                Aquí no hay juicio, solo presencia. ¿Qué quieres explorar hoy?
              </p>

              {esAlquimia && <ReflexionDelDia onConversar={enviar} />}

              <div className="flex flex-wrap justify-center gap-2">
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    onClick={() => enviar(s)}
                    disabled={chatBloqueado}
                    className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-600 transition hover:border-amber-500 hover:text-amber-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:text-stone-400 dark:hover:border-amber-400/60 dark:hover:text-amber-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            const esUsuario = m.role === "user";
            const texto = m.parts
              .map((part) => (part.type === "text" ? part.text : ""))
              .join("");
            const generando = status === "streaming" && m.id === ultimoId;
            const leyendo = hablandoId === m.id;

            return (
              <div
                key={m.id}
                className={`flex ${esUsuario ? "justify-end" : "justify-start"}`}
              >
                {esUsuario ? (
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-stone-200 px-5 py-3 leading-relaxed text-stone-800 dark:bg-stone-800 dark:text-stone-100">
                    {texto}
                  </div>
                ) : (
                  <div className="max-w-[85%]">
                    <div className="font-serif text-[1.05rem] leading-relaxed text-stone-700 dark:text-amber-50/90">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {texto}
                      </ReactMarkdown>
                    </div>

                    {lecturaSoportada && texto && !generando && (
                      <button
                        onClick={() => alternarLectura(m.id, texto)}
                        aria-label={
                          leyendo ? "Detener lectura" : "Escuchar mensaje"
                        }
                        className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition ${
                          leyendo
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
                            : "text-stone-500 hover:bg-stone-200 hover:text-amber-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-amber-200"
                        }`}
                      >
                        {leyendo ? <IconoStop /> : <IconoParlante />}
                        {leyendo ? "Detener" : "Escuchar"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Indicador de carga */}
          {status === "submitted" && (
            <div
              className="flex items-center gap-1.5 px-2"
              aria-label="Escribiendo"
            >
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="h-2 w-2 animate-bounce rounded-full bg-amber-500/70"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          )}

          {detalleError && !limiteAlcanzado && (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">
                {detalleError.mensaje}
              </p>

              {/* Solo aparece en desarrollo: la causa técnica real */}
              {detalleError.detalle && (
                <p className="max-w-md break-words font-mono text-xs text-stone-500 dark:text-stone-400">
                  {detalleError.detalle}
                </p>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </section>

      {/* Alerta: límite diario alcanzado */}
      {limiteAlcanzado && (
        <div
          role="alert"
          className="border-t border-red-200 bg-red-50 px-4 py-4 dark:border-red-400/30 dark:bg-red-500/10"
        >
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
            <p className="text-sm font-medium leading-relaxed text-red-700 dark:text-red-300">
              {MENSAJES_API.LIMIT_REACHED}
            </p>
            <button
              type="button"
              onClick={() => setVerPlanes(true)}
              className="shrink-0 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
            >
              Ver Plan Pro
            </button>
          </div>
        </div>
      )}

      {/* Entrada */}
      <footer className="border-t border-stone-200 px-4 py-4 dark:border-stone-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar(input);
          }}
          className="mx-auto flex max-w-2xl items-end gap-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar(input);
              }
            }}
            rows={1}
            disabled={chatBloqueado}
            placeholder={
              sinSesion
                ? "Inicia sesión para conversar..."
                : limiteAlcanzado
                  ? "Límite diario alcanzado"
                  : escuchando
                    ? "Te escucho..."
                    : "Escribe lo que hay en tu corazón..."
            }
            className="max-h-40 flex-1 resize-none rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-amber-400/60"
          />

          <button
            type="button"
            onClick={alternarDictado}
            disabled={!dictadoSoportado || (chatBloqueado && !escuchando)}
            aria-label={escuchando ? "Detener dictado" : "Dictar por voz"}
            title={
              dictadoSoportado
                ? escuchando
                  ? "Detener dictado"
                  : "Dictar por voz"
                : "Tu navegador no soporta dictado por voz"
            }
            className={`relative rounded-2xl border p-3 transition disabled:cursor-not-allowed disabled:opacity-40 ${
              escuchando
                ? "border-red-400 bg-red-50 text-red-600 dark:border-red-400/60 dark:bg-red-500/10 dark:text-red-300"
                : "border-stone-300 text-stone-600 hover:border-amber-500 hover:text-amber-800 dark:border-stone-700 dark:text-stone-400 dark:hover:border-amber-400/60 dark:hover:text-amber-200"
            }`}
          >
            {escuchando && (
              <span className="absolute inset-0 animate-ping rounded-2xl bg-red-400/20" />
            )}
            <IconoMic className="relative h-5 w-5" />
          </button>

          <button
            type="submit"
            disabled={isLoading || chatBloqueado || !input.trim()}
            className="rounded-2xl bg-amber-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-amber-600 disabled:opacity-40 dark:bg-amber-600/80 dark:hover:bg-amber-500/80"
          >
            Enviar
          </button>
        </form>

        {errorVoz && (
          <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-red-600 dark:text-red-400">
            {errorVoz}
          </p>
        )}

        {soporteVerificado && !dictadoSoportado && (
          <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-stone-500 dark:text-stone-400">
            {MENSAJES_ERROR_VOZ["no-support"]}
          </p>
        )}

        <p className="mx-auto mt-3 max-w-2xl text-center text-[11px] text-stone-400 dark:text-stone-500">
          Guía filosófica, no un sustituto de ayuda profesional. Si atraviesas
          una crisis, busca apoyo de un profesional de salud mental.
        </p>
      </footer>

      <HistoryPanel
        open={verHistorial}
        onClose={() => setVerHistorial(false)}
        conversacionActualId={conversationId}
        onAbrir={abrirConversacion}
        onNueva={nuevaConversacion}
      />

      <PricingModal open={verPlanes} onClose={() => setVerPlanes(false)} />
    </main>
  );
}
