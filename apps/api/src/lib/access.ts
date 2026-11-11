import { canView } from "@digi/domain";
import type { GrantVisibility, ItemStatus, ReleaseJobStatus } from "@prisma/client";

type ViewItem = {
  status: ItemStatus;
  capsule: { ownerUserId: string };
  grants: {
    revokedAt: Date | null;
    visibility: GrantVisibility;
    personId: string;
    person: { linkedUserId: string | null };
  }[];
  releaseJobs: { personId: string; status: ReleaseJobStatus }[];
};

export function recipientCanView(userId: string, item: ViewItem) {
  const grant = item.grants.find(
    (entry) => !entry.revokedAt && entry.visibility === "released_only" && entry.person.linkedUserId === userId,
  );
  const job = grant ? item.releaseJobs.find((entry) => entry.personId === grant.personId && entry.status === "sent") : undefined;
  return canView(
    { kind: "recipient", userId },
    { ownerUserId: item.capsule.ownerUserId, status: item.status },
    grant
      ? {
          linkedUserId: grant.person.linkedUserId,
          visibility: grant.visibility,
          revoked: false,
          jobStatus: job?.status ?? null,
        }
      : null,
  );
}
