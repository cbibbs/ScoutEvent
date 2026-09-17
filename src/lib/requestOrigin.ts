import { headers } from "next/headers";

// Resolves this request's absolute origin server-side (design.md §1 of
// specs/005-slideshow-join-qr). Used to build the slideshow's QR value
// without reading window.location.origin on the client, which caused a
// hydration mismatch: the server always rendered no QR and the client's
// first render always rendered one, so the trees diverged.
//
// Prefers the x-forwarded-* pair a proxy (e.g. Vercel) sets, falling
// back to the plain `host` header for local dev where there's no proxy
// in front of the dev server.
export async function resolveOrigin(): Promise<string> {
  const headersList = await headers();
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  const host =
    headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "";
  return `${proto}://${host}`;
}
