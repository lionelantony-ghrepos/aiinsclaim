export function AccessNotice({ notice }: { notice?: string }) {
  if (notice !== "forbidden") {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-text"
    >
      You do not have access to that page. You were redirected to your home
      view.
    </div>
  );
}
