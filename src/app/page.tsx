export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 dark:bg-zinc-950">
      <main className="w-full max-w-2xl space-y-6 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Learning project
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          aiinsclaim
        </h1>
        <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          AI-native, agentic insurance claims processing — lightweight local
          stack with SQLite, Drizzle, and mock agents.
        </p>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-left text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            Quick start
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-100 p-4 font-mono text-xs text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            {`npm run db:push\nnpm run seed\nnpm run dev`}
          </pre>
        </div>
      </main>
    </div>
  );
}
