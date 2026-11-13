export function calendarJobKey(itemId: string, personId: string, occurrenceIso: string, generation: number): string {
  return `${itemId}:${personId}:${occurrenceIso}:g${generation}`;
}

export function memoryReadyKey(itemId: string, personId: string, occurrenceIso: string, generation: number): string {
  return `memory-ready:${itemId}:${personId}:${occurrenceIso}:g${generation}`;
}

export function verificationJobKey(caseId: string, itemId: string, personId: string): string {
  return `${caseId}:${itemId}:${personId}`;
}

export function reminderKey(cycleId: string, offsetDays: number, channel: string): string {
  return `cycle:${cycleId}:reminder:${offsetDays}:${channel}`;
}

/** Stable across retries. A new check-in generation makes the previous warning obsolete. */
export function checkInNoticeKey(input: {
  userId: string;
  cycleId: string;
  generation: number;
  kind: string;
  channel: string;
}): string {
  return `check-in:${input.userId}:${input.cycleId}:g${input.generation}:${input.kind}:${input.channel}`;
}

export function unreachableNoticeKey(cycleId: string, personId: string): string {
  return `cycle:${cycleId}:unreachable:${personId}:email`;
}

export function simulatedReleaseKey(cycleId: string): string {
  return `cycle:${cycleId}:simulated-release:email`;
}

/** Test-mode delivery after the day-21 record. Separate from a verification-case job. */
export function testCheckInJobKey(cycleId: string, itemId: string, personId: string): string {
  return `test-check-in:${cycleId}:${itemId}:${personId}`;
}
