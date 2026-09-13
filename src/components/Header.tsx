import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./SignOutButton";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold">
          ScoutEvent
        </Link>
        <nav className="flex items-center gap-4">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm text-gray-600 hover:underline dark:text-gray-400"
              >
                Dashboard
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:underline dark:text-gray-400"
            >
              Organizer sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
