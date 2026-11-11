export const routes = {
  home: "/",
  start: "/signup",
  signIn: "/login",
  what: "/#what",
  purpose: "/#purpose",
  time: "/#time",
  audiences: "/#audiences",
  vision: "/#vision",
  privacy: "/#privacy",
  earlyAccess: "/#early-access",
  privacyPolicy: "/privacy",
  terms: "/terms",
  contact: "/contact",
} as const;

export const primaryNav = [
  { href: routes.what, label: "What it is" },
  { href: routes.purpose, label: "Purpose" },
  { href: routes.vision, label: "Vision" },
  { href: routes.privacy, label: "Privacy" },
] as const;

export const footerInfo = [
  { href: routes.privacyPolicy, label: "Privacy Policy" },
  { href: routes.terms, label: "Terms of Service" },
  { href: routes.contact, label: "Contact" },
] as const;

export const footerBlurb =
  "Digi Capsule is a private place to keep a message, a photograph, or a short video until a moment that has not arrived yet.";

export const hero = {
  support: "Preserve what matters today. Share it with the people who matter tomorrow.",
  slogan: "Memories are forever. Now their moments can be too.",
  highlight: "moments can be too.",
  description:
    "Digi Capsule is a digital time-capsule platform that lets you preserve personal messages, memories, photos and videos for the people you care about. Choose when they should be shared, so your words and memories can reach loved ones at moments that truly matter.",
  primary: "Get Early Access",
  secondary: "Discover Our Purpose",
} as const;

export const what = {
  kicker: "What is Digi Capsule?",
  title: "A way to send a memory into the future.",
  paragraphs: [
    "Digi Capsule gives you a way to send memories into the future. It allows you to preserve meaningful moments, personal messages and experiences today, with the intention of sharing them with selected people at a later time.",
    "Think of it as a digital time capsule. You keep the words, the photographs, and the short videos that belong to a person or a day. They wait with you, instead of disappearing into a chat that was only meant for the moment it was sent.",
  ],
} as const;

export const why = {
  kicker: "Why Digi Capsule exists",
  title: "Some words are worth more when they arrive later.",
  points: [
    { title: "Words left unsaid", body: "Important words are sometimes left unsaid. A feeling can stay in someone’s chest because the day never offered a quiet enough place for it." },
    { title: "Stories worth keeping", body: "Memories and personal stories deserve to be preserved. A voice, a photograph, or a few honest sentences can carry a life that a feed will not remember." },
    { title: "Meaning that grows", body: "Special moments can have meaning years later. A day that feels ordinary now can become the one someone needs to return to." },
    { title: "Something left behind", body: "People want to leave something meaningful for their loved ones. Not a performance. A message that was chosen with care." },
    { title: "Not everything is urgent", body: "Digital communication should not always have to be immediate. Some messages are kinder when they are allowed to wait." },
  ],
} as const;

export const timeMeaning = {
  kicker: "The meaning behind time",
  title: "A message from the past can arrive at the right moment.",
  intro:
    "There is a particular feeling in receiving something that was prepared before the day arrived. The person who wrote it was thinking of you when this moment was still ahead.",
  note: "These are illustrations of the feeling Digi Capsule is built around. They are not a description of a particular delivery feature.",
  examples: [
    { title: "A birthday, prepared early", body: "A birthday message prepared years in advance, waiting for the morning someone turns an age that once felt far away." },
    { title: "A letter for a milestone", body: "A letter for a child’s future milestone, written while they are still small enough to sit in the writer’s lap." },
    { title: "A family occasion", body: "Memories shared with family on a special occasion, so the people who were in the room can be felt by the people who come later." },
    { title: "A message for someone ahead", body: "A personal message intended for someone in the future, kept until the day the writer hoped they would read it." },
  ],
} as const;

export const audiences = {
  kicker: "Who is Digi Capsule for?",
  title: "For people who want a memory to outlast the day.",
  groups: [
    { title: "Families", body: "Families preserving memories they want to keep together, rather than leaving them scattered across phones." },
    { title: "Parents", body: "Parents creating messages for their children’s future, while the feeling is still close." },
    { title: "Couples", body: "Couples preserving meaningful moments they may want to return to on a later anniversary or an ordinary Tuesday." },
    { title: "Individuals", body: "Individuals who want to leave personal messages, in their own words, for someone they have already chosen." },
    { title: "Anyone who keeps people close", body: "People who value memories and meaningful connections, and who would rather hold a message than send it before it is ready." },
  ],
} as const;

export const vision = {
  kicker: "Our vision",
  statement:
    "We believe that the most meaningful messages should not be limited by time. Digi Capsule exists to help people preserve what matters and share it when the moment is right.",
} as const;

export const privacy = {
  kicker: "Privacy and trust",
  title: "A memory is personal. It should be treated that way.",
  paragraphs: [
    "The messages, photographs, and videos people keep here are private by nature. Digi Capsule is built so a draft stays with the person who saved it.",
    "Passwords are stored as Argon2id hashes. The password itself is not kept. Letter text is encrypted with AES-256-GCM before it is stored. Photographs and videos stay in private storage, and there is no permanent public link. A temporary file link can be issued for the owner, and it expires. Sign-in uses an HttpOnly session cookie.",
    "Digi Capsule does not claim a security certification. This build does not send memories through an outside email or text-message service, and it does not promise that a message will be delivered.",
  ],
} as const;

export const closing = {
  title: "Some messages are worth waiting for.",
  body: "Be among the first to experience a new way of preserving memories and sharing them with the people who matter.",
  action: "Join the Early Access List",
} as const;

export const policyVersion = "2026-11-10";

export type ApplicationIcon = "family" | "occasion" | "child" | "distance" | "milestone" | "letter" | "media";
