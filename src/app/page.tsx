import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-10 sm:px-10">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col justify-center gap-8">
        <div className="max-w-2xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Auth Starter
          </p>
          <h1 className="text-4xl font-bold leading-tight text-neutral-950 sm:text-6xl">
            Login and register are ready.
          </h1>
          <p className="mt-5 text-lg leading-8 text-neutral-700">
            Create a local account, sign in, and visit the protected dashboard.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className="rounded-lg bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              href="/register"
            >
              Register
            </Link>
            <Link
              className="rounded-lg border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-900 transition hover:border-neutral-950"
              href="/login"
            >
              Login
            </Link>
            <Link
              className="rounded-lg border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-700 transition hover:border-neutral-950 hover:text-neutral-950"
              href="/dashboard"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["SQLite", "User accounts are stored locally through Prisma."],
            ["Password Hashing", "Passwords are hashed before they are saved."],
            ["Session Cookie", "Protected pages use a signed HTTP-only cookie."]
          ].map(([title, body]) => (
            <article
              className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
              key={title}
            >
              <h2 className="font-semibold text-neutral-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">{body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
