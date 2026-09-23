import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { tasks, users, type ClaimRoute, type Lob } from "@/lib/db/schema";
import { getParameter } from "@/lib/rules/params";

type AssignOutputs = {
  assignment_strategy?: string;
  specialty?: string;
  specialty_from?: string;
  pool?: string;
  assigned?: boolean;
};

export async function resolveAdjusterId(
  db: Db,
  params: {
    claimId: string;
    route: ClaimRoute;
    lineOfBusiness: Lob;
    injuryInvolved: boolean;
    assignOutputs: AssignOutputs;
  },
): Promise<string | null> {
  if (params.assignOutputs.assigned === false) {
    return null;
  }

  const strategy = params.assignOutputs.assignment_strategy;
  if (!strategy || strategy === "supervision_queue") {
    return null;
  }

  const maxOpenParam = await getParameter(db, "assign.max_open_tasks");
  const maxOpenTasks = Number(maxOpenParam.valueJson);

  const adjusterRows = await db
    .select({
      id: users.id,
      specialties: users.specialties,
    })
    .from(users)
    .where(and(eq(users.role, "adjuster"), eq(users.isActive, true)));

  const requiredSpecialty =
    params.assignOutputs.specialty ??
    (params.assignOutputs.specialty_from === "line_of_business"
      ? params.lineOfBusiness
      : undefined);

  const eligible = adjusterRows.filter((adjuster) => {
    if (!requiredSpecialty) {
      return true;
    }
    return adjuster.specialties.includes(requiredSpecialty);
  });

  if (eligible.length === 0) {
    return null;
  }

  const workloads = await Promise.all(
    eligible.map(async (adjuster) => {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(tasks)
        .where(
          and(
            eq(tasks.assignedTo, adjuster.id),
            inArray(tasks.status, ["open", "in_progress"]),
          ),
        );
      return { id: adjuster.id, openTasks: row?.count ?? 0 };
    }),
  );

  const underCap = workloads.filter((row) => row.openTasks < maxOpenTasks);
  const pool = underCap.length > 0 ? underCap : workloads;

  if (strategy === "round_robin") {
    const index =
      params.claimId
        .replaceAll("-", "")
        .split("")
        .reduce((sum, char) => sum + char.charCodeAt(0), 0) % pool.length;
    return pool[index]?.id ?? null;
  }

  if (strategy === "least_loaded") {
    const sorted = [...pool].sort((a, b) => a.openTasks - b.openTasks);
    return sorted[0]?.id ?? null;
  }

  return pool[0]?.id ?? null;
}
