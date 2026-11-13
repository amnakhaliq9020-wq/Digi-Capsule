import { Status, type StatusKind } from "@/components/Status";

export function FormAlert({
  children,
  kind = "error",
}: {
  children: React.ReactNode;
  kind?: Extract<StatusKind, "error" | "warning" | "success">;
}) {
  return (
    <div className={kind === "success" ? "banner" : "error"} role="alert">
      <Status kind={kind}>{children}</Status>
    </div>
  );
}
