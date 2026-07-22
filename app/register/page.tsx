import Link from "next/link";
import { register } from "@/app/actions";
import SubmitButton from "@/components/SubmitButton";
import GoogleButton, { googleError } from "@/components/GoogleButton";

const ERRORS: Record<string, string> = {
  email: "Please enter a valid email address.",
  short: "Password must be at least 6 characters.",
  match: "The two passwords do not match.",
  exists: "An account with this email already exists. Try signing in.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-4xl font-bold text-center">SmartSaku</h1>
        <p className="text-inksoft text-center mt-2 mb-8 text-sm">
          Create your account — free, takes 10 seconds.
        </p>
        <div className="mb-4">
          <GoogleButton label="Sign up with Google" />
          <div className="flex items-center gap-3 my-4">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] font-bold text-inksoft uppercase tracking-wide">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </div>

        <form
          action={register}
          className="bg-card border border-line rounded-lg p-6 shadow-soft space-y-4"
        >
          {error && (
            <div className="bg-badbg text-bad rounded-md px-4 py-3 text-sm font-semibold">
              {ERRORS[error] ?? "Something went wrong. Please try again."}
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
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-md border border-line bg-cream2 px-4 py-3 text-sm focus:outline-none focus:border-sagedeep"
              placeholder="at least 6 characters"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-inksoft mb-1.5" htmlFor="confirm">
              Repeat password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-md border border-line bg-cream2 px-4 py-3 text-sm focus:outline-none focus:border-sagedeep"
              placeholder="same password again"
            />
          </div>
          <SubmitButton
            className="w-full rounded-full bg-sagedeep text-cream2 font-bold py-3.5 text-sm hover:opacity-90"
            pendingText="Creating account…"
          >
            Create account
          </SubmitButton>
          <p className="text-center text-xs text-inksoft">
            Already have an account?{" "}
            <Link href="/login" className="text-sagedeep font-bold">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
