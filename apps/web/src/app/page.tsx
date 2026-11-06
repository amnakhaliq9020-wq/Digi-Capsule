import Link from "next/link";

export default function HomePage() {
  return (
    <main className="hero card">
      <p className="pill">Private family legacy</p>
      <h1>Keep a memory, and decide who may receive it.</h1>
      <p className="muted">
        Digi Capsule stores letters, photos, and videos for the people you choose. A missed check-in means we have not heard from you. It does not send your memories.
      </p>
      <div className="row">
        <Link className="button" href="/signup">Create an account</Link>
        <Link className="button secondary" href="/login">Sign in</Link>
      </div>
    </main>
  );
}
