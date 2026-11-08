export const routes = {
  home: "/",
  start: "/signup",
  signIn: "/login",
  about: "/#about",
  vision: "/#vision",
  howItWorks: "/#how-it-works",
  applications: "/#applications",
  features: "/#features",
  security: "/#security",
  future: "/#future",
  privacy: "/privacy",
  terms: "/terms",
  contact: "/contact",
} as const;

export const primaryNav = [
  { href: routes.vision, label: "Vision" },
  { href: routes.howItWorks, label: "How it works" },
  { href: routes.applications, label: "Applications" },
  { href: routes.features, label: "Features" },
  { href: routes.security, label: "Security" },
  { href: routes.future, label: "Future" },
] as const;

export const footerExplore = primaryNav;

export const footerInfo = [
  { href: routes.about, label: "About" },
  { href: routes.features, label: "Features" },
  { href: routes.privacy, label: "Privacy Policy" },
  { href: routes.terms, label: "Terms" },
  { href: routes.contact, label: "Contact" },
] as const;

export const hero = {
  kicker: "Private memories, held for a moment you choose",
  lines: ["Your Memories.", "Your Moments.", "Your Legacy."],
  lede:
    "Keep a letter, a photograph, or a short video for someone you choose. Digi Capsule holds it privately until the date you set, so words written today can wait for a birthday, an anniversary, or another moment that matters.",
  primary: "Get Started",
  secondary: "Explore Features",
} as const;

export const heroFacts = [
  { title: "Private until you decide", body: "A draft stays in your account. Naming a person does not send it." },
  { title: "A date you choose", body: "You pick the day, the time, and the time zone. The product does not guess the occasion." },
  { title: "A check-in is not a delivery", body: "I’m Alive records that you can sign in. It never sends a memory." },
] as const;

export const vision = {
  kicker: "Our vision",
  title: "Preserve today’s words for a day that has not arrived.",
  paragraphs: [
    "People mean to say the important things, and then the years move. A story stays on a phone. A letter stays unsent. Digi Capsule is a private holding place for the memories, messages, photographs, videos, and personal stories you want someone to have later.",
    "A parent can write for a child. Two people far apart can leave a note for an anniversary. A family can keep the pictures that belong with the story. You choose the person, and you choose the condition.",
    "A legacy here means the words and media you decided to keep. Digi Capsule is not a will, and it does not decide that someone has died.",
  ],
} as const;

export const steps = [
  {
    title: "Create your account.",
    body: "Add your name, email, and password, and choose the time zone your dates should use. You confirm the email before the account is ready.",
  },
  {
    title: "Save meaningful memories and messages.",
    body: "Write a letter and attach the photographs or videos that belong with it. A draft remains private.",
  },
  {
    title: "Choose trusted contacts and delivery conditions.",
    body: "Name the people who may receive it. Choose a date and time, or save a separate memory as If I am gone.",
  },
  {
    title: "Let your memories reach their recipients at the right time.",
    body: "On the date you set, Digi Capsule releases that memory to the people you named. A missed check-in does not send it.",
  },
] as const;

export const deliveryNote =
  "On a chosen date, Digi Capsule records the release for the people you named. This build does not send that release through an outside email or SMS service. I’m Alive never sends a memory. Memories saved as If I am gone are not released in production.";

export type ApplicationIcon = "family" | "occasion" | "child" | "distance" | "milestone" | "letter" | "media";

export const applications: readonly { title: string; body: string; icon: ApplicationIcon }[] = [
  {
    title: "Family legacy preservation",
    body: "Keep the stories, photographs, and short videos you want your family to have. They stay in your account, addressed only to the people you name.",
    icon: "family",
  },
  {
    title: "Birthday and anniversary surprises",
    body: "Write the note now and choose the day it should be released. A birthday or anniversary is the date you enter.",
    icon: "occasion",
  },
  {
    title: "Messages for children in the future",
    body: "Record a letter for a birthday that is still years away. It remains private, and it is scheduled for the date you pick.",
    icon: "child",
  },
  {
    title: "Long-distance relationships",
    body: "When you cannot be in the room, a message can still be waiting. Choose the person and the day you want it held for.",
    icon: "distance",
  },
  {
    title: "Personal milestones and achievements",
    body: "Attach the photographs from a day you want remembered, and write what that day meant. The memory and the pictures stay together.",
    icon: "milestone",
  },
  {
    title: "Future letters and life advice",
    body: "Say what you would want someone to read later: encouragement, a family story, or practical words. It is still yours until the date you set.",
    icon: "letter",
  },
  {
    title: "Preserving important photographs and videos",
    body: "Photos are limited to 15 MB and videos to 100 MB in the default configuration. Files stay in private storage, with no permanent public link.",
    icon: "media",
  },
];

export const features = [
  {
    title: "Digital time capsules",
    body: "Each memory is a private letter. Photographs and videos can be saved with it, and a draft is not visible to the people you name.",
  },
  {
    title: "Scheduled delivery",
    body: "Choose a date, a time, and a time zone. Digi Capsule holds the memory until then and records the release for the people you selected.",
  },
  {
    title: "Trusted contacts",
    body: "You can name recipients, trusted contacts, and verifiers. Trusted contacts and verifiers cannot read your drafts.",
  },
  {
    title: "Media storage",
    body: "Photos and videos are stored privately. The application checks the signed-in account before it opens a file.",
  },
  {
    title: "Special occasion releases",
    body: "Use a date you care about. Digi Capsule does not infer a birthday or an anniversary from a contact record.",
  },
  {
    title: "Liveness confirmation",
    body: "I’m Alive records that you are reachable and sets the next check-in 30 days later. Pressing it never sends a memory. Missed check-ins are recorded as warnings, and those warnings do not include the letter.",
  },
] as const;

export const securityIntro = {
  kicker: "Security and privacy",
  title: "You decide what is kept, who is named, and when it may be released.",
  body: "These are the controls in this application. Digi Capsule does not claim a certification, and an outside mail service is not connected.",
};

export const securityControls = [
  {
    title: "Your choices",
    body: "You choose the memory, the recipients, and the delivery condition. A draft stays private. Trusted contacts and verifiers are not given your drafts.",
  },
  {
    title: "Passwords",
    body: "Passwords are stored as Argon2id hashes. The password itself is not stored.",
  },
  {
    title: "Sessions",
    body: "Sign-in uses an HttpOnly session cookie with SameSite set to Lax. The cookie is marked Secure when the app runs in production. The server stores a hash of the session token, and sign-out revokes that session.",
  },
  {
    title: "Letters",
    body: "Letter text is encrypted with AES-256-GCM before it is stored.",
  },
  {
    title: "Photos and videos",
    body: "Files are kept in private storage. There is no permanent public link. The API checks the signed-in account before it opens a file. Media files are not encrypted separately from that storage.",
  },
  {
    title: "Requests and email codes",
    body: "The API rate-limits requests, and a change sent from a different site origin is refused. Email confirmation uses a code. In this build the code is shown in the app, because an outside mail provider is not connected.",
  },
] as const;

export const securityLimits =
  "Memories saved as If I am gone are not released in production. A missed check-in records warnings that do not include the memory. This build does not send releases through an outside email or SMS service, and it does not treat a timer as proof of death.";

export const future = {
  kicker: "Future possibilities",
  status: "Planned",
  title: "An AI face and voice, when the archive is ready for it.",
  body: "A later version may offer a face and voice experience for memories a person was allowed to receive. Any generated speech or picture would be labeled synthetic. Digi Capsule would not present a generated sentence as something you definitely said.",
  boundary:
    "This experience is not available today. Saving a letter, photo, or video does not create an avatar, and there is no separate signup for it.",
} as const;

export const closing = {
  title: "Some Moments Deserve to Last Forever.",
  body: "Open an account and write the first memory. It stays private until you choose a person and a delivery condition.",
  action: "Create Your First Capsule",
} as const;

export const policyVersion = "2026-11-05";
