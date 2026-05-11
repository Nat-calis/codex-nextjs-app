import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen px-6 py-10 sm:px-10">
      <section className="mx-auto max-w-4xl">
        <nav className="flex items-center justify-between border-b border-neutral-200 pb-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-bold text-neutral-950">Welcome, {user.name}</h1>
          </div>
          <LogoutButton />
        </nav>

        <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Account</h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-neutral-500">Name</dt>
              <dd className="mt-1 text-neutral-950">{user.name}</dd>
            </div>
            <div>
              <dt className="font-medium text-neutral-500">Email</dt>
              <dd className="mt-1 text-neutral-950">{user.email}</dd>
            </div>
            <div>
              <dt className="font-medium text-neutral-500">Created</dt>
              <dd className="mt-1 text-neutral-950">
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "medium",
                  timeStyle: "short"
                }).format(user.createdAt)}
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  );
}
