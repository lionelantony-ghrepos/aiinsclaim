"use client";

import { useState } from "react";
import { askCopilotAction, type CopilotActionResult } from "./actions";

export function CopilotPanel() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Extract<CopilotActionResult, { ok: true }>["data"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    setResult(undefined);
    const response = await askCopilotAction(question);
    if (response.ok) {
      setResult(response.data);
    } else {
      setError(response.error.message);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="block text-sm font-medium" htmlFor="copilot-question">
          Ask about claims, fraud signals, or SLA timers
        </label>
        <textarea
          id="copilot-question"
          className="min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Which claims have the highest estimated amounts?"
          maxLength={2_000}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Querying…" : "Ask copilot"}
        </button>
        <p aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      </form>

      {result ? (
        <section aria-live="polite" className="space-y-4">
          <div>
            <h2 className="font-semibold">Answer</h2>
            <p className="text-sm text-text-muted">{result.explanation}</p>
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface-raised">
                <tr>
                  {result.columns.map((column) => (
                    <th className="px-3 py-2 font-medium" key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, index) => (
                  <tr className="border-t border-border" key={index}>
                    {result.columns.map((column) => (
                      <td className="px-3 py-2" key={column}>{String(row[column] ?? "—")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Generated SQL</summary>
            <pre className="mt-2 overflow-x-auto rounded-md bg-surface-raised p-3 text-xs">{result.sql}</pre>
          </details>
          {result.truncated ? (
            <p className="text-sm text-text-muted">Results were limited by the copilot guardrail.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
