import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./SignOutButton";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-border-soft bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3 L21 20 H3 Z" />
            <path d="M12 3 L12 20" />
            <path d="M7.5 12 H16.5" />
          </svg>
          <span className="font-display text-[17px]">ScoutEvent</span>
        </Link>
        <nav className="flex items-center gap-5">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm font-semibold text-ink-soft hover:text-ink"
              >
                Dashboard
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="text-sm font-semibold text-ink-soft hover:text-ink"
            >
              Organizer sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
