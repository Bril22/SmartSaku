import Image from "next/image";
import Link from "next/link";
import { login } from "@/app/actions";
import SubmitButton from "@/components/SubmitButton";
import GoogleButton, { googleError } from "@/components/GoogleButton";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Image
          src="/brand/mascot-hero.png"
          alt="Saku-Kun, the SmartSaku mascot"
          width={120}
          height={154}
          priority
          className="mx-auto mb-3 drop-shadow-sm"
        />
        <h1 className="font-display text-4xl font-bold text-center">SmartSaku</h1>
        <p className="text-inksoft text-center mt-2 mb-8 text-sm">
          Your warm money manager. Sign in to continue.
        </p>
        <div className="mb-4">
          <GoogleButton label="Continue with Google" />
          <div className="flex items-center gap-3 my-4">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] font-bold text-inksoft uppercase tracking-wide">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </div>

        <form
          action={login}
          className="bg-card border border-line rounded-lg p-6 shadow-soft space-y-4"
        >
          {error && (
            <div className="bg-badbg text-bad rounded-md px-4 py-3 text-sm font-semibold">
              {googleError(error) ?? "Email or password is wrong. Please try again."}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-inksoft mb-1.5" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-line bg-cream2 px-4 py-3 text-sm focus:outline-none focus:border-sagedeep"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-inksoft mb-1.5" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-line bg-cream2 px-4 py-3 text-sm focus:outline-none focus:border-sagedeep"
              placeholder="••••••••"
            />
          </div>
          <SubmitButton
            className="w-full rounded-full bg-sagedeep text-cream2 font-bold py-3.5 text-sm hover:opacity-90"
            pendingText="Signing in…"
          >
            Sign in
          </SubmitButton>
          <p className="text-center text-xs text-inksoft">
            New here?{" "}
            <Link href="/register" className="text-sagedeep font-bold">
              Create account
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
