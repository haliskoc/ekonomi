"use client";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#070b14] text-white">
        <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center p-6">
          <section className="w-full border border-white/25 bg-[#10182b] p-6">
            <h1 className="text-xl font-semibold">Kritik hata</h1>
            <p className="mt-2 text-sm text-white/75">Uygulama beklenmedik bir durumla karsilasti. Kod: {error.digest || "n/a"}</p>
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="mt-4 border border-white bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              Yeniden Yukle
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
