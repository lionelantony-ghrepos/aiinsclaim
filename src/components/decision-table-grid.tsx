export type DecisionTableGridProps = {
  caption: string;
  columns: string[];
  rows: string[][];
};

export function DecisionTableGrid({
  caption,
  columns,
  rows,
}: DecisionTableGridProps) {
  return (
    <div data-testid="decision-table-grid" className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="mb-2 text-left text-sm text-text-muted">
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-border bg-surface-raised text-left">
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="h-8 px-3 font-medium text-text"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.join("-")} className="border-b border-border">
              {row.map((cell, cellIndex) => (
                <td
                  key={`${rowIndex}-${cellIndex}`}
                  className="h-8 px-3 font-mono text-text"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
