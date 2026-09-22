"use client";

import { useCallback, useRef, type KeyboardEvent } from "react";
import type {
  RuleActionInput,
  RuleConditionInput,
  RuleRowInput,
} from "@/lib/schemas/rules-admin";
import { cn } from "@/lib/utils";

export type DecisionTableStructuredRow = RuleRowInput;

type ReadonlyDecisionTableGridProps = {
  caption: string;
  columns: string[];
  rows: string[][];
  structuredRows?: never;
  onRowsChange?: never;
  readOnly?: never;
};

type StructuredDecisionTableGridProps = {
  caption: string;
  columns?: string[];
  rows?: never;
  structuredRows: DecisionTableStructuredRow[];
  onRowsChange?: (rows: DecisionTableStructuredRow[]) => void;
  readOnly?: boolean;
};

export type DecisionTableGridProps =
  | ReadonlyDecisionTableGridProps
  | StructuredDecisionTableGridProps;

const DEFAULT_STRUCTURED_COLUMNS = ["Label", "Conditions", "Actions"];

function formatCondition(condition: RuleConditionInput): string {
  return `${condition.inputKey} ${condition.operator} ${JSON.stringify(condition.value)}`;
}

function formatAction(action: RuleActionInput): string {
  return `${action.actionType} ${JSON.stringify(action.params)}`;
}

function structuredToDisplayRows(
  structuredRows: DecisionTableStructuredRow[],
): string[][] {
  return structuredRows.map((row) => [
    row.label,
    row.conditions.map(formatCondition).join("; ") || "—",
    row.actions.map(formatAction).join("; ") || "—",
  ]);
}

function parseConditions(raw: string): RuleConditionInput[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "—") {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as RuleConditionInput[];
    }
  } catch {
    // fall through to semicolon format
  }
  return trimmed.split(";").map((part) => {
    const [inputKey, operator, ...rest] = part.trim().split(/\s+/);
    return {
      inputKey: inputKey ?? "",
      operator: (operator ?? "eq") as RuleConditionInput["operator"],
      value: rest.length > 0 ? JSON.parse(rest.join(" ")) : null,
    };
  });
}

function parseActions(raw: string): RuleActionInput[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "—") {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as RuleActionInput[];
    }
  } catch {
    // fall through to semicolon format
  }
  return trimmed.split(";").map((part) => {
    const [actionType, ...rest] = part.trim().split(/\s+/);
    return {
      actionType: (actionType ?? "set_output") as RuleActionInput["actionType"],
      params: rest.length > 0 ? JSON.parse(rest.join(" ")) : {},
    };
  });
}

export function DecisionTableGrid(props: DecisionTableGridProps) {
  if ("structuredRows" in props && props.structuredRows) {
    return (
      <StructuredDecisionTableGrid
        caption={props.caption}
        columns={props.columns ?? DEFAULT_STRUCTURED_COLUMNS}
        structuredRows={props.structuredRows}
        onRowsChange={props.onRowsChange}
        readOnly={props.readOnly}
      />
    );
  }

  const { caption, columns, rows } = props;
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
            <tr key={`${rowIndex}-${row.join("-")}`} className="border-b border-border">
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

function StructuredDecisionTableGrid({
  caption,
  columns,
  structuredRows,
  onRowsChange,
  readOnly = false,
}: {
  caption: string;
  columns: string[];
  structuredRows: DecisionTableStructuredRow[];
  onRowsChange?: (rows: DecisionTableStructuredRow[]) => void;
  readOnly?: boolean;
}) {
  const cellRefs = useRef<(HTMLInputElement | null)[][]>([]);
  const displayRows = structuredToDisplayRows(structuredRows);

  const updateCell = useCallback(
    (rowIndex: number, cellIndex: number, value: string) => {
      if (readOnly || !onRowsChange) {
        return;
      }
      const next = structuredRows.map((row, index) => {
        if (index !== rowIndex) {
          return row;
        }
        if (cellIndex === 0) {
          return { ...row, label: value };
        }
        if (cellIndex === 1) {
          return { ...row, conditions: parseConditions(value) };
        }
        return { ...row, actions: parseActions(value) };
      });
      onRowsChange(next);
    },
    [onRowsChange, readOnly, structuredRows],
  );

  const focusCell = (rowIndex: number, cellIndex: number) => {
    cellRefs.current[rowIndex]?.[cellIndex]?.focus();
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    cellIndex: number,
  ) => {
    if (event.key === "ArrowDown" && rowIndex < displayRows.length - 1) {
      event.preventDefault();
      focusCell(rowIndex + 1, cellIndex);
    }
    if (event.key === "ArrowUp" && rowIndex > 0) {
      event.preventDefault();
      focusCell(rowIndex - 1, cellIndex);
    }
  };

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
          {displayRows.map((row, rowIndex) => (
              <tr key={structuredRows[rowIndex]?.order ?? rowIndex} className="border-b border-border">
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} className="p-0">
                    {readOnly ? (
                      <span
                        tabIndex={0}
                        aria-label={`${columns[cellIndex]} row ${rowIndex + 1}`}
                        className="block h-8 px-3 py-1.5 font-mono text-text focus-visible:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                      >
                        {cell}
                      </span>
                    ) : (
                      <input
                        ref={(element) => {
                          if (!cellRefs.current[rowIndex]) {
                            cellRefs.current[rowIndex] = [];
                          }
                          cellRefs.current[rowIndex][cellIndex] = element;
                        }}
                        type="text"
                        defaultValue={cell}
                        tabIndex={0}
                        aria-label={`${columns[cellIndex]} row ${rowIndex + 1}`}
                        className={cn(
                          "h-8 w-full border-0 bg-transparent px-3 font-mono text-sm text-text",
                          "focus-visible:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary",
                        )}
                        onBlur={(event) =>
                          updateCell(rowIndex, cellIndex, event.currentTarget.value)
                        }
                        onKeyDown={(event) =>
                          handleKeyDown(event, rowIndex, cellIndex)
                        }
                      />
                    )}
                  </td>
                ))}
              </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
