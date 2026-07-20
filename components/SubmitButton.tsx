"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  className,
  pendingText = "Please wait…",
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-70`}>
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span className="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
          {pendingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
