"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Zap, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ClaimAuditEvent } from "@/lib/db/queries/kpi";

type AuditEventCardProps = {
  event: ClaimAuditEvent;
  index: number;
};

export function AuditEventCard({ event, index }: AuditEventCardProps) {
  const [expanded, setExpanded] = useState(false);

  const timestamp = new Date(event.event_at);
  const inputs = event.inputs_json ? JSON.parse(event.inputs_json) : null;
  const outputs = event.outputs_json ? JSON.parse(event.outputs_json) : null;

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/50"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {index + 1}
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            {event.event_type === "rule_eval" && (
              <>
                <GitBranch className="h-4 w-4" />
                <span className="font-semibold">Rule Evaluation</span>
              </>
            )}
            {event.event_type === "agent_run" && (
              <>
                <Zap className="h-4 w-4" />
                <span className="font-semibold">Agent Run</span>
              </>
            )}
            {event.event_type === "state_change" && (
              <>
                <ArrowRight className="h-4 w-4" />
                <span className="font-semibold">State Transition</span>
              </>
            )}
            {event.actor && (
              <Badge tone="default" className="font-mono text-xs">
                {event.actor}
              </Badge>
            )}
            {event.agent_id && (
              <Badge tone="info" className="font-mono text-xs">
                {event.agent_id}
              </Badge>
            )}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {timestamp.toLocaleString()}
            {event.from_status && event.to_status && (
              <span className="ml-2">
                {event.from_status} → {event.to_status}
              </span>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t p-4 space-y-3">
          {event.event_type === "rule_eval" && (
            <>
              {event.version_id && (
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    Version ID
                  </div>
                  <div className="font-mono text-sm">{event.version_id}</div>
                </div>
              )}
              {event.matched_rule_ids && (
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    Matched Rules
                  </div>
                  <div className="font-mono text-sm">
                    {JSON.parse(event.matched_rule_ids).join(", ")}
                  </div>
                </div>
              )}
              {inputs && (
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    Inputs
                  </div>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(inputs, null, 2)}
                  </pre>
                </div>
              )}
              {outputs && (
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    Outputs
                  </div>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(outputs, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}

          {event.event_type === "agent_run" && (
            <>
              {inputs && (
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    Input (Redacted)
                  </div>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(inputs, null, 2)}
                  </pre>
                </div>
              )}
              {outputs && (
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    Output
                  </div>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(outputs, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}

          {event.event_type === "state_change" && (
            <div className="flex items-center gap-4">
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  From
                </div>
                <Badge tone="default">{event.from_status || "—"}</Badge>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  To
                </div>
                <Badge tone="success">{event.to_status}</Badge>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
