/** Turns an event name into a URL-safe slug with a short random suffix
 * to avoid collisions (design.md §2: `events.slug` is unique). */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  const suffix = crypto.randomUUID().slice(0, 6);

  return base ? `${base}-${suffix}` : suffix;
}
