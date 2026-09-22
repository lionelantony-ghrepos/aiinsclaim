export default function Home() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-sm font-medium uppercase tracking-wide text-text-muted">
        Learning project
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">aiinsclaim</h1>
      <p className="text-lg leading-8 text-text-muted">
        AI-native, agentic insurance claims processing — Ledger workbench shell
        for Auto and Property claims. Navigation and pages are filtered by your
        signed-in role.
      </p>
      <div className="rounded-xl border border-border bg-surface p-6 text-sm">
        <p className="font-medium">Quick start</p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-raised p-4 font-mono text-xs">
          {`npm run db:push\nnpm run seed\nnpm run dev`}
        </pre>
      </div>
    </div>
  );
}
