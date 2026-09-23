import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export type WorkbenchDocument = {
  id: string;
  docType: string;
  status: string;
  mimeType: string;
};

export function DocumentsPanel({ documents }: { documents: WorkbenchDocument[] }) {
  return (
    <Card data-testid="workbench-documents" className="space-y-3">
      <CardHeader className="mb-0">
        <CardTitle>Documents ({documents.length})</CardTitle>
      </CardHeader>
      {documents.length === 0 ? (
        <p className="text-sm text-text-muted">No documents uploaded yet.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              data-testid={`workbench-doc-${doc.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
            >
              <span className="font-medium capitalize">
                {doc.docType.replaceAll("_", " ")}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-text-muted">{doc.mimeType}</span>
                <DocumentStatusBadge status={doc.status} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
