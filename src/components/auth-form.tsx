"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");

    if (isRegister && password !== String(formData.get("confirmPassword") ?? "")) {
      setError("Passwords do not match.");
      setIsLoading(false);
      return;
    }

    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        password
      })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setError(data?.message ?? "Something went wrong. Please try again.");
      setIsLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <Link className="mb-8 text-sm font-medium text-neutral-600 hover:text-neutral-950" href="/">
        Back home
      </Link>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          {isRegister ? "Create account" : "Welcome back"}
        </p>
        <h1 className="mt-3 text-3xl font-bold text-neutral-950">
          {isRegister ? "Register" : "Login"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          {isRegister
            ? "Start with a local account for this app."
            : "Enter your account details to continue."}
        </p>
      </div>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        {isRegister ? (
          <label className="block">
            <span className="text-sm font-medium text-neutral-800">Name</span>
            <input
              className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-neutral-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              name="name"
              required
              type="text"
            />
          </label>
        ) : null}

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Email</span>
          <input
            autoComplete="email"
            className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-neutral-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            name="email"
            required
            type="email"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Password</span>
          <input
            autoComplete={isRegister ? "new-password" : "current-password"}
            className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-neutral-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>

        {isRegister ? (
          <label className="block">
            <span className="text-sm font-medium text-neutral-800">Confirm password</span>
            <input
              autoComplete="new-password"
              className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-neutral-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              minLength={8}
              name="confirmPassword"
              required
              type="password"
            />
          </label>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          className="w-full rounded-lg bg-neutral-950 px-4 py-3 font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          type="submit"
        >
          {isLoading ? "Please wait..." : isRegister ? "Create account" : "Login"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-600">
        {isRegister ? "Already have an account?" : "Need an account?"}{" "}
        <Link
          className="font-semibold text-emerald-700 hover:text-emerald-800"
          href={isRegister ? "/login" : "/register"}
        >
          {isRegister ? "Login" : "Register"}
        </Link>
      </p>
    </div>
  );
}
