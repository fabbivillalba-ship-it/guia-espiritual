import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // Omite archivos internos de Next.js y estáticos
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Siempre se ejecuta para las rutas de API
    "/(api|trpc)(.*)",
    // Rutas internas de Clerk
    "/__clerk/(.*)",
  ],
};