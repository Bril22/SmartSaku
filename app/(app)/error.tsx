"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app error", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
      <div className="text-5xl mb-3">🌱</div>
      <h1 className="font-display text-xl font-semibold mb-1">Something went wrong</h1>
      <p className="text-sm text-inksoft max-w-xs mb-5">
        A hiccup on our side — your data is safe. Try again in a moment.
      </p>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-full bg-sagedeep text-cream2 font-bold px-5 py-2.5 text-sm"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-full border border-line px-5 py-2.5 text-sm font-bold text-inksoft"
        >
          Home
        </a>
      </div>
    </div>
  );
}
