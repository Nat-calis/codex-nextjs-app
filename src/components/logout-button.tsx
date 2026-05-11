"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isLoading}
      onClick={handleLogout}
      type="button"
    >
      {isLoading ? "Logging out..." : "Logout"}
    </button>
  );
}
