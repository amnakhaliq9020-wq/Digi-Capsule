import { Icon, type IconName } from "@/components/icons/Icon";

export type StatusKind = "success" | "warning" | "error" | "pending" | "delivered";

const copy: Record<StatusKind, { icon: IconName; label: string }> = {
  success: { icon: "success", label: "Success" },
  warning: { icon: "warning", label: "Warning" },
  error: { icon: "error", label: "Error" },
  pending: { icon: "pending", label: "Pending" },
  delivered: { icon: "delivery", label: "Delivered" },
};

export function statusKindFor(value: string): StatusKind {
  if (["sent", "released", "delivered", "connected", "on_time", "verified"].includes(value)) return "delivered";
  if (["failed", "error", "overdue", "rejected"].includes(value)) return "error";
  if (["cancelled", "warning", "escalation_pending", "unverified"].includes(value)) return "warning";
  return "pending";
}

export function Status({ kind, children }: { kind: StatusKind; children?: React.ReactNode }) {
  const item = copy[kind];
  return (
    <span className={`status status-${kind}`}>
      <Icon name={item.icon} />
      <span className="status-label">{item.label}</span>
      {children ? <span>{children}</span> : null}
    </span>
  );
}
