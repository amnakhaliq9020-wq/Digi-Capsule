export type ViewPrincipal =
  | { kind: "anonymous" }
  | { kind: "author"; userId: string }
  | { kind: "recipient"; userId: string }
  | { kind: "trusted_contact"; userId: string };

export type ViewItem = {
  ownerUserId: string;
  status: "draft" | "scheduled" | "released" | "withheld" | "cancelled";
};

export type ViewGrant = {
  linkedUserId: string | null;
  visibility: "hidden" | "released_only";
  revoked: boolean;
  jobStatus: "pending" | "sending" | "sent" | "failed" | "cancelled" | "dead" | null;
};

export function canView(principal: ViewPrincipal, item: ViewItem, grant: ViewGrant | null): boolean {
  if (principal.kind === "anonymous") return false;
  if (principal.kind === "author") return principal.userId === item.ownerUserId;
  if (principal.kind === "trusted_contact") return false;
  if (!grant || grant.revoked) return false;
  if (grant.visibility !== "released_only") return false;
  if (grant.linkedUserId !== principal.userId) return false;
  if (item.status !== "released") return false;
  return grant.jobStatus === "sent";
}
