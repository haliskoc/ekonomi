"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg border border-white/20 bg-[#10182b] p-6 text-white">
        <h2 className="text-lg font-semibold">Bir hata olustu</h2>
        <p className="mt-2 text-sm text-white/75">Sayfa yeniden denenebilir. Hata kodu: {error.digest || "n/a"}</p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mt-4 border border-white bg-white px-4 py-2 text-sm font-semibold text-black"
        >
          Tekrar Dene
        </button>
      </div>
    </div>
  );
}
