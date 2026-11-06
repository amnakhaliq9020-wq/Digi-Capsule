export type VerificationState =
  | "none"
  | "open"
  | "collecting"
  | "cooling_off"
  | "cancellation_window"
  | "release_authorized"
  | "releasing"
  | "released"
  | "recovered"
  | "disputed"
  | "cancelled";

export type AttestationPosition = "believe_deceased" | "reached_alive" | "unknown" | "dispute";

export type VerificationEvent =
  | { type: "verifier_opens_case" }
  | { type: "case_acknowledged" }
  | {
      type: "attestation_recorded";
      position: AttestationPosition;
      believeCount: number;
      quorumRequired: number;
      coolingOffStarted: boolean;
    }
  | { type: "attestation_withdrawn"; believeCount: number; quorumRequired: number; coolingOffStarted: boolean }
  | { type: "cooling_off_elapsed" }
  | { type: "window_elapsed_without_recovery" }
  | { type: "jobs_created" }
  | { type: "all_jobs_sent_or_dead" }
  | { type: "author_authenticated"; pendingJobIds: string[] }
  | { type: "dispute_opened" }
  | { type: "author_or_policy_closes" }
  | { type: "missed_check_in" }
  | { type: "unreachable_notice" };

export type VerificationResult = {
  state: VerificationState;
  cancelJobIds: string[];
};

const RECOVERABLE: VerificationState[] = [
  "open",
  "collecting",
  "cooling_off",
  "cancellation_window",
  "release_authorized",
  "disputed",
  "releasing",
];

export function verificationReducer(state: VerificationState, event: VerificationEvent): VerificationResult {
  const stay = (next: VerificationState = state, cancelJobIds: string[] = []): VerificationResult => ({
    state: next,
    cancelJobIds,
  });

  if (event.type === "missed_check_in" || event.type === "unreachable_notice") {
    return stay();
  }

  if (event.type === "verifier_opens_case") {
    if (state !== "none") throw new Error("CASE_ALREADY_OPEN");
    return stay("open");
  }

  if (event.type === "case_acknowledged") {
    if (state !== "open") throw new Error("ILLEGAL_TRANSITION");
    return stay("collecting");
  }

  if (event.type === "author_authenticated") {
    if (!RECOVERABLE.includes(state)) return stay();
    if (state === "released") return stay();
    return stay("recovered", event.pendingJobIds);
  }

  if (event.type === "dispute_opened" || (event.type === "attestation_recorded" && (event.position === "dispute" || event.position === "reached_alive"))) {
    if (state === "released" || state === "recovered" || state === "cancelled" || state === "none") {
      throw new Error("ILLEGAL_TRANSITION");
    }
    return stay("disputed");
  }

  if (event.type === "attestation_recorded") {
    if (state !== "collecting" && state !== "open") throw new Error("ILLEGAL_TRANSITION");
    if (event.position === "believe_deceased" && event.believeCount >= event.quorumRequired) {
      return stay("cooling_off");
    }
    return stay(state === "open" ? "collecting" : state);
  }

  if (event.type === "attestation_withdrawn") {
    if (event.coolingOffStarted) return stay("disputed");
    if (event.believeCount >= event.quorumRequired) return stay("cooling_off");
    return stay("collecting");
  }

  if (event.type === "cooling_off_elapsed") {
    if (state !== "cooling_off") throw new Error("ILLEGAL_TRANSITION");
    return stay("cancellation_window");
  }

  if (event.type === "window_elapsed_without_recovery") {
    if (state !== "cancellation_window") throw new Error("ILLEGAL_TRANSITION");
    return stay("release_authorized");
  }

  if (event.type === "jobs_created") {
    if (state !== "release_authorized") throw new Error("ILLEGAL_TRANSITION");
    return stay("releasing");
  }

  if (event.type === "all_jobs_sent_or_dead") {
    if (state !== "releasing") throw new Error("ILLEGAL_TRANSITION");
    return stay("released");
  }

  if (event.type === "author_or_policy_closes") {
    if (state !== "disputed") throw new Error("ILLEGAL_TRANSITION");
    return stay("cancelled");
  }

  return stay();
}

export function missedCheckInCreatesContentJob(): boolean {
  return false;
}
