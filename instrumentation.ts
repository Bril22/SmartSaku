export async function register() {
  // reserved for wiring an error service (Sentry, etc.) at startup
}

/** Structured server-error logging. Every uncaught request error lands here
 * with route context, ready to forward to an error service later. */
export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: { routerKind?: string; routePath?: string; routeType?: string },
) {
  const e = error as { message?: string; digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      at: new Date().toISOString(),
      msg: e?.message ?? "request error",
      digest: e?.digest,
      method: request?.method,
      path: request?.path,
      route: context?.routePath,
      routeType: context?.routeType,
    }),
  );
}
