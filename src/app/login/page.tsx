"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [nextPath, setNextPath] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const candidate = params.get("next") || "/";
    setNextPath(candidate.startsWith("/") ? candidate : "/");
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "login failed");
      }

      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <section className="w-full rounded-xl border border-white/20 bg-[#0f1728cc] p-6 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
        <h1 className="text-xl font-bold uppercase tracking-[0.18em]">Giris</h1>
        <p className="mt-2 text-sm text-white/65">Devam etmek icin giris yapin.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="text-white/70">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-1 w-full border border-white/30 bg-black px-3 py-2 outline-none focus:border-white"
              placeholder="admin@ekonomi.local"
            />
          </label>

          <label className="block text-sm">
            <span className="text-white/70">Sifre</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-1 w-full border border-white/30 bg-black px-3 py-2 outline-none focus:border-white"
              placeholder="••••••••"
            />
          </label>

          {error ? <p className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full border border-white bg-white px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:border-white/40 disabled:bg-black disabled:text-white/40"
          >
            {loading ? "Giris yapiliyor..." : "Giris Yap"}
          </button>
        </form>
      </section>
    </main>
  );
}
