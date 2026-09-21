import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TaskResolutionReasonRequiredError } from "@/lib/auth/errors";
import type { IsolatedDb } from "@/lib/db/isolated";
import { insertTask, updateTask } from "@/lib/db/queries/tasks";
import {
  createPushedClone,
  openPushedDb,
  removeTempDir,
} from "../helpers/isolated-db";
import { insertMinimalClaim } from "../helpers/pbi-004-fixtures";

let temp: { dir: string; file: string };
let isolated: IsolatedDb;

describe("TC-004-05 task resolution_reason", () => {
  beforeAll(() => {
    temp = createPushedClone();
    isolated = openPushedDb(temp.file);
  }, 180_000);

  afterAll(() => {
    isolated?.close();
    if (temp?.dir) removeTempDir(temp.dir);
  });

  it("rejects override/reject without a non-empty reason and accepts valid resolutions", async () => {
    const { claimId } = await insertMinimalClaim(isolated.db);
    const base = {
      claimId,
      type: "review_triage" as const,
      queue: "intake" as const,
    };

    await expect(
      insertTask(isolated.db, {
        ...base,
        resolution: "overridden",
      }),
    ).rejects.toBeInstanceOf(TaskResolutionReasonRequiredError);

    await expect(
      insertTask(isolated.db, {
        ...base,
        resolution: "rejected",
        resolutionReason: "   ",
      }),
    ).rejects.toBeInstanceOf(TaskResolutionReasonRequiredError);

    const accepted = await insertTask(isolated.db, {
      ...base,
      resolution: "accepted",
    });
    expect(accepted.resolution).toBe("accepted");

    const withReason = await insertTask(isolated.db, {
      ...base,
      resolution: "overridden",
      resolutionReason: "manual override",
    });
    expect(withReason.resolutionReason).toBe("manual override");

    await expect(
      updateTask(isolated.db, accepted.id, {
        resolution: "rejected",
      }),
    ).rejects.toBeInstanceOf(TaskResolutionReasonRequiredError);

    const updated = await updateTask(isolated.db, accepted.id, {
      resolution: "rejected",
      resolutionReason: "does not match evidence",
    });
    expect(updated?.resolution).toBe("rejected");
  });
});
