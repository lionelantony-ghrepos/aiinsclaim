"use client";

import { useActionState } from "react";
import { loginAction, type LoginActionState } from "./actions";

const initialState: LoginActionState = {};

export function LoginForm({
  nextPath,
  demoAccounts,
}: {
  nextPath: string | null;
  demoAccounts: readonly { role: string; email: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <div className="w-full max-w-lg space-y-6">
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-text-muted">
          Ledger
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-text-muted">
          Use a demo account below. Password for all accounts is{" "}
          <span className="font-mono">demo1234</span>.
        </p>
      </div>

      <form
        action={formAction}
        className="space-y-4 rounded-xl border border-border bg-surface p-6"
      >
        {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            className="h-10 w-full rounded-md border border-border bg-bg px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-10 w-full rounded-md border border-border bg-bg px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
        </div>

        {state.error ? (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Demo accounts</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {demoAccounts.map((account) => (
            <li
              key={account.email}
              className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-b-0 last:pb-0"
            >
              <span className="text-text-muted">{account.role}</span>
              <span className="font-mono text-xs">{account.email}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
