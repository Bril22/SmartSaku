"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#FFEED6",
          color: "#443A28",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🌱</div>
          <h1 style={{ fontSize: 22, margin: "0 0 6px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#6F6350", maxWidth: 300, margin: "0 auto 20px" }}>
            Please try again. Your data is safe.
          </p>
          <button
            onClick={reset}
            style={{
              borderRadius: 999,
              background: "#31694E",
              color: "#FFF7EA",
              fontWeight: 700,
              padding: "10px 20px",
              border: "none",
              fontSize: 14,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
