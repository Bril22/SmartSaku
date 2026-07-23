import Image from "next/image";

export const metadata = { title: "Offline — SmartSaku" };

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center px-6 bg-cream">
      <Image src="/brand/mascot-wave.png" alt="Saku-Kun" width={140} height={140} priority />
      <h1 className="font-display text-2xl font-semibold mt-4 mb-2">You are offline</h1>
      <p className="text-sm text-inksoft max-w-xs mb-6">
        SmartSaku needs a connection to load your money. Your data is safe — it will be here as
        soon as you are back online.
      </p>
      <a
        href="/"
        className="rounded-full bg-sagedeep text-cream2 font-bold px-6 py-3 text-sm"
      >
        Try again
      </a>
    </main>
  );
}
