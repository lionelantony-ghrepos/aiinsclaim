import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { CopilotPanel } from "./copilot-panel";

export default function CopilotPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-sm text-text-muted">Claims intelligence</p>
        <h1 className="text-2xl font-semibold tracking-tight">Claims copilot</h1>
        <p className="mt-1 text-sm text-text-muted">
          Ask questions over approved reporting views. Every answer discloses its generated SQL.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Natural-language query</CardTitle>
        </CardHeader>
        <CopilotPanel />
      </Card>
    </div>
  );
}
