"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportAuditChainToCsvAction } from "../../actions";

type ExportAuditCsvButtonProps = {
  claimId: string;
  claimNumber: string;
};

export function ExportAuditCsvButton({
  claimId,
  claimNumber,
}: ExportAuditCsvButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportAuditChainToCsvAction(claimId);
      if (!result.ok) {
        alert(`Export failed: ${result.error.message}`);
        return;
      }

      // Create a blob and trigger download
      const blob = new Blob([result.data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-chain-${claimNumber}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("Export failed");
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button onClick={handleExport} disabled={isExporting}>
      <Download className="h-4 w-4" />
      {isExporting ? "Exporting..." : "Export CSV"}
    </Button>
  );
}
