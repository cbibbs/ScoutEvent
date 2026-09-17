// Single interpretation of an event's upload window, shared between the
// guest upload page (`/e/[slug]/page.tsx`) and the slideshow (which must
// re-evaluate this as it runs unattended — see
// specs/005-slideshow-join-qr/design.md §2). `Date.now()` is called here,
// inside an ordinary function, rather than as a literal in a component's
// render body — the latter trips the React Compiler's purity lint rule
// even for these Server Components.

export function uploadWindowState(
  uploadStartsAt: string | null,
  uploadEndsAt: string | null,
) {
  const now = Date.now();
  return {
    notOpenYet: Boolean(
      uploadStartsAt && now < new Date(uploadStartsAt).getTime(),
    ),
    closed: Boolean(uploadEndsAt && now > new Date(uploadEndsAt).getTime()),
  };
}

export function computeUploadsOpen(
  uploadStartsAt: string | null,
  uploadEndsAt: string | null,
) {
  const { notOpenYet, closed } = uploadWindowState(
    uploadStartsAt,
    uploadEndsAt,
  );
  return !notOpenYet && !closed;
}
