export type WarningId = 'first' | 'second' | 'final';

export type WarningCopy = {
  id: WarningId;
  title: string;
  /** Days after the missed check-in before this message is used. */
  afterDays: number;
  emailSubject: string;
  emailBody: string;
  smsBody: string;
};

/**
 * No response for 7 days, then a second message 7 days later, then a final message 7 days after that.
 * None of these messages release or send a memory.
 */
export const WARNING_MESSAGES: readonly WarningCopy[] = [
  {
    id: 'first',
    title: 'First warning',
    afterDays: 7,
    emailSubject: 'Please confirm you can still sign in to Digi Capsule',
    emailBody:
      'We have not had a response for 7 days since your check-in was due. Please sign in and confirm you are reachable. Confirming only records that you can still open Digi Capsule. It does not send your memories. Not answering is not proof that something has happened to you.',
    smsBody:
      'Digi Capsule: no check-in response for 7 days. Please sign in and press I\'m here. This does not send your memories.',
  },
  {
    id: 'second',
    title: 'Second warning',
    afterDays: 14,
    emailSubject: 'Second reminder: we still have not heard from you',
    emailBody:
      'This is a second reminder, 7 days after the first warning. We still have not heard from you. Please sign in and confirm you are reachable. Confirming does not send your memories. Silence does not mean you have died, and it does not release your capsule.',
    smsBody:
      'Digi Capsule: second reminder. We still have not heard from you. Please sign in. Silence does not release your memories.',
  },
  {
    id: 'final',
    title: 'Final warning',
    afterDays: 21,
    emailSubject: 'Final reminder: please confirm you can still sign in',
    emailBody:
      'This is the final reminder, 7 days after the second warning. Please sign in when you can and confirm you are reachable. This message does not send your memories to anyone. Not answering is not proof of death, and it does not release your capsule.',
    smsBody:
      'Digi Capsule: final reminder. Please sign in when you can. Not answering does not send your memories.',
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function warningsFor(nextCheckInAt: Date, now = new Date()) {
  return WARNING_MESSAGES.map((warning) => {
    const dueAt = new Date(nextCheckInAt.getTime() + warning.afterDays * DAY_MS);
    return {
      ...warning,
      dueAt,
      status: now.getTime() >= dueAt.getTime() ? ('due' as const) : ('waiting' as const),
    };
  });
}
