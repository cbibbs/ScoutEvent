"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const initialError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(initialError);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }

    setStatus("sent");
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6">
      <h1 className="mb-2 font-display text-2xl">Organizer sign in</h1>
      <p className="mb-6 text-sm text-ink-soft">
        We&apos;ll email you a magic link — no password needed.
      </p>

      {status === "sent" ? (
        // Names the sender and subject because the magic link is sent by
        // Supabase's shared mail service, so it doesn't obviously come
        // from ScoutEvent. Keep the subject here in step with the one set
        // on Supabase's Magic Link template (supabase/templates/magic-link.html).
        <div className="card flex flex-col gap-3 p-5 text-sm">
          <p className="font-semibold text-success">
            Sign-in link sent to {email}
          </p>
          <p className="text-ink-soft">
            Look for an email with the subject{" "}
            <span className="font-semibold text-ink">
              &ldquo;Your ScoutEvent sign-in link&rdquo;
            </span>
            . It&apos;s sent through Supabase, our sign-in provider, so the
            sender won&apos;t say ScoutEvent.
          </p>
          <p className="text-ink-faint">
            It can take a minute to arrive. If it doesn&apos;t, check your
            spam folder, or{" "}
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="font-semibold text-primary underline"
            >
              try a different address
            </button>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="btn btn-primary"
          >
            {status === "sending" ? "Sending…" : "Send magic link"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
