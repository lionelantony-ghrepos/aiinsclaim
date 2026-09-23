"use client";

import { useState, useTransition } from "react";
import {
  draftCommunication,
  sendMockCommunication,
  updateCommunicationDraft,
} from "../actions";
import {
  COMMS_TEMPLATES,
  type CommsDraft,
  type CommsDraftType,
} from "@/lib/schemas/agents/comms";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { NotificationStatus } from "@/lib/db/schema/enums";

type OutboxItem = {
  id: string;
  title: string;
  bodyMd: string;
  deliveryStatus: NotificationStatus;
};

export function CommunicationsPanel({
  claimId,
  denialReasonCode,
  outbox,
}: {
  claimId: string;
  denialReasonCode: string | null;
  outbox: OutboxItem[];
}) {
  const [draftType, setDraftType] = useState<CommsDraftType>("acknowledgement");
  const [draft, setDraft] = useState<
    (CommsDraft & { agentRunId: string; agentFailed: boolean }) | null
  >(null);
  const [outboxId, setOutboxId] = useState<string | null>(null);
  const [outboxItems, setOutboxItems] = useState(outbox);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const deliveryStatusLabel: Record<NotificationStatus, string> = {
    draft: "Draft",
    mock_sent: "Mock sent",
    not_applicable: "Not applicable",
  };

  const template = COMMS_TEMPLATES.find((item) => item.draftType === draftType);

  function generate() {
    if (!template) return;
    setMessage(null);
    startTransition(async () => {
      const result = await draftCommunication({
        claimId,
        draftType,
        templateId: template.id,
        tone: "professional",
        readingLevel: "plain",
      });
      if (result.ok) {
        setDraft(result.data);
        setOutboxId(null);
        setEditing(false);
        setMessage(
          result.data.agentFailed
            ? "AI generation failed after retry. A manual-review task was created; review the fallback before saving. Nothing was sent."
            : "AI-generated draft ready for human review. Nothing was sent.",
        );
      } else {
        setMessage(result.error.message);
      }
    });
  }

  function save() {
    if (!draft) return;
    setMessage(null);
    startTransition(async () => {
      const result = await updateCommunicationDraft({
        ...draft,
        claimId,
        outboxId: outboxId ?? undefined,
      });
      if (result.ok) {
        setOutboxId(result.data.outboxId);
        setOutboxItems((items) => [
          {
            id: result.data.outboxId,
            title: draft.subject,
            bodyMd: draft.bodyMd,
            deliveryStatus: "draft",
          },
          ...items.filter((item) => item.id !== result.data.outboxId),
        ]);
        setEditing(false);
        setMessage("Draft saved to the mock outbox. It has not been sent.");
      } else {
        setMessage(result.error.message);
      }
    });
  }

  function send() {
    if (!outboxId) return;
    setMessage(null);
    startTransition(async () => {
      const result = await sendMockCommunication({ claimId, outboxId });
      if (result.ok) {
        setOutboxItems((items) =>
          items.map((item) =>
            item.id === outboxId ? { ...item, deliveryStatus: "mock_sent" } : item,
          ),
        );
      }
      setMessage(
        result.ok
          ? "Mock communication recorded after explicit human send."
          : result.error.message,
      );
    });
  }

  return (
    <section
      className="space-y-4"
      data-testid="comms-draft-panel"
      aria-labelledby="comms-heading"
    >
      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle id="comms-heading">AI communications drafts</CardTitle>
            <p className="text-sm text-text-muted">
              AI-generated draft only. A staff member must review, edit, save, and explicitly send.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              <span>Draft communication</span>
              <select
                className="rounded-md border border-border bg-surface px-3 py-2"
                data-testid="comms-template-select"
                value={draftType}
                onChange={(event) =>
                  setDraftType(event.target.value as CommsDraftType)
                }
              >
                {COMMS_TEMPLATES.map((item) => (
                  <option key={item.id} value={item.draftType}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              data-testid="comms-generate"
              disabled={pending}
              onClick={generate}
            >
              Generate draft
            </Button>
          </div>
          {draftType === "decision_letter" ? (
            <p className="text-sm text-text-muted">
              Coded denial reason: {denialReasonCode ?? "Unavailable"}
            </p>
          ) : null}
        </CardHeader>
      </Card>

      {draft ? (
        <Card data-testid="comms-preview">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Editable draft preview</CardTitle>
              <Button type="button" variant="outline" onClick={() => setEditing((value) => !value)}>
                {editing ? "Stop editing" : "Edit draft"}
              </Button>
            </div>
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm">
                Subject
                <input
                  className="rounded-md border border-border bg-surface px-3 py-2"
                  data-testid="comms-subject"
                  disabled={!editing || pending}
                  value={draft.subject}
                  onChange={(event) =>
                    setDraft({ ...draft, subject: event.target.value })
                  }
                />
              </label>
              <label className="grid gap-1 text-sm">
                Body
                <textarea
                  className="min-h-48 rounded-md border border-border bg-surface px-3 py-2"
                  data-testid="comms-body"
                  disabled={!editing || pending}
                  value={draft.bodyMd}
                  onChange={(event) =>
                    setDraft({ ...draft, bodyMd: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" data-testid="comms-save" disabled={pending} onClick={save}>
                Save draft
              </Button>
              <Button
                type="button"
                variant="outline"
                data-testid="comms-send"
                disabled={pending || !outboxId}
                onClick={send}
              >
                Send mock communication
              </Button>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <p role="status" aria-live="polite" className="text-sm text-text-muted">
        {message ?? "No draft generated. Generation does not send a communication."}
      </p>

      <Card data-testid="comms-outbox">
        <CardHeader>
          <CardTitle>Mock outbox</CardTitle>
          {outboxItems.length === 0 ? (
            <p className="text-sm text-text-muted">No saved communications. Generation alone does not create a sent communication.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {outboxItems.map((item) => (
                <li key={item.id} className="rounded-md border border-border p-3">
                  <span className="font-medium">{item.title}</span>
                  <span className="ml-2 text-text-muted">
                    ({deliveryStatusLabel[item.deliveryStatus]})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardHeader>
      </Card>
    </section>
  );
}
