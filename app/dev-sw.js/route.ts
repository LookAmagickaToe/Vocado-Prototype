import { NextResponse } from "next/server"

// This project used to run through Vite PWA on localhost:3000. Browsers that
// still have its development service worker can keep serving the old Vite HTML
// even while Next.js is healthy. The obsolete page then requests /@vite/client
// and /src/main.tsx forever.
//
// Vite's worker checks this exact URL, so in development we replace it once
// with a cleanup worker. It clears only Cache Storage for this localhost origin,
// unregisters itself, and reloads controlled tabs onto the current Next app.
const cleanupWorker = `
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
    await self.registration.unregister();

    const windows = await self.clients.matchAll({ type: "window" });
    await Promise.all(windows.map((client) => client.navigate(client.url)));
  })());
});
`

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse(null, { status: 404 })
  }

  return new NextResponse(cleanupWorker, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  })
}
