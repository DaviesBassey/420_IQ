import Link from "next/link";

const SURFACES: { href: string; title: string; blurb: string; role: string }[] = [
  {
    href: "/claim",
    title: "Claim this device",
    blurb: "Sign in with a role and PIN before opening an operator surface.",
    role: "Start here",
  },
  {
    href: "/console",
    title: "Producer Console",
    blurb: "Run the show: state transitions, timers, lifelines, scoring and holds.",
    role: "Producer",
  },
  {
    href: "/editor",
    title: "Question & Pack Editor",
    blurb: "Author questions, run the review workflow, generate and approve packs.",
    role: "Producer / Editor",
  },
  {
    href: "/host",
    title: "Host Display",
    blurb: "Question wording, approved explanation and prompts. Add ?game=<id>.",
    role: "Host",
  },
  {
    href: "/stage",
    title: "Stage Display",
    blurb: "Knowledge Ring, scoreboard and Knowledge Drops. Add ?game=<id>.",
    role: "Audience-facing",
  },
  {
    href: "/contestant/1",
    title: "Contestant Display",
    blurb: "Question, choices, timer, confidence and lifelines. Add ?game=<id>.",
    role: "Contestant",
  },
];

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        maxWidth: "1080px",
        margin: "0 auto",
        padding: "clamp(1.5rem, 4vw, 4rem)",
        display: "flex",
        flexDirection: "column",
        gap: "2rem",
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <p
          style={{
            fontFamily: "var(--font-display)",
            letterSpacing: "0.35em",
            textTransform: "uppercase",
            color: "var(--amber-deep)",
            fontSize: "0.8rem",
            margin: 0,
          }}
        >
          420 IQ
        </p>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(2rem, 5vw, 3.25rem)",
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          Pilot Control System
        </h1>
        <p style={{ color: "#9aa4b2", maxWidth: "60ch", margin: 0 }}>
          Studio control for the 420 IQ knowledge game show. Choose a surface below.
          Claim this device with a role and PIN first — the operator surfaces
          (Console, Editor) require it.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        }}
      >
        {SURFACES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              padding: "1.25rem",
              borderRadius: "14px",
              border: "1px solid var(--graphite-500)",
              background: "var(--graphite-700)",
              color: "var(--offwhite)",
              textDecoration: "none",
            }}
          >
            <span
              style={{
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: "var(--amber-deep)",
              }}
            >
              {s.role}
            </span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", fontWeight: 600 }}>
              {s.title}
            </span>
            <span style={{ color: "#9aa4b2", fontSize: "0.9rem" }}>{s.blurb}</span>
          </Link>
        ))}
      </section>

      <footer style={{ color: "#6b7280", fontSize: "0.8rem" }}>
        Displays need a game: create one in the Console, then open a display with its
        <code style={{ color: "#9aa4b2" }}> ?game=&lt;id&gt; </code>link.
      </footer>
    </main>
  );
}
