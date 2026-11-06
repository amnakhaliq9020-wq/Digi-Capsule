export function calendarJobKey(itemId: string, personId: string, occurrenceIso: string): string {
  return `${itemId}:${personId}:${occurrenceIso}`;
}

export function verificationJobKey(caseId: string, itemId: string, personId: string): string {
  return `${caseId}:${itemId}:${personId}`;
}

export function reminderKey(cycleId: string, offsetDays: number, channel: string): string {
  return `cycle:${cycleId}:reminder:${offsetDays}:${channel}`;
}

export function unreachableNoticeKey(cycleId: string, personId: string): string {
  return `cycle:${cycleId}:unreachable:${personId}:email`;
}

export function simulatedReleaseKey(cycleId: string): string {
  return `cycle:${cycleId}:simulated-release:email`;
}
