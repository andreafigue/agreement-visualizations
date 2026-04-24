import Link from "next/link";

const cardStyle = {
  display: "block",
  padding: "1.25rem",
  borderRadius: 16,
  border: "1px solid #dbe2ea",
  background: "white",
  color: "#0f172a",
  textDecoration: "none",
  boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
} satisfies React.CSSProperties;

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
        padding: "3rem 1.5rem",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ maxWidth: 640, marginBottom: "2rem" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 1, color: "#0f172a" }}>Agreement Visualizations</h1>
          <p style={{ margin: "1rem 0 0", fontSize: "1rem", lineHeight: 1.6, color: "#475569" }}>
            Choose a view to explore the latest exported run. The timeline and network now live on separate pages.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          <Link href="/agreement-timeline" style={cardStyle}>
            <div style={{ fontSize: "0.8rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
              View 1
            </div>
            <h2 style={{ margin: "0.55rem 0 0", fontSize: "1.4rem" }}>Agreement Timeline</h2>
            <p style={{ margin: "0.75rem 0 0", color: "#475569", lineHeight: 1.6 }}>
              Explore weekly or cumulative agreement trends over time.
            </p>
          </Link>

          <Link href="/agreement-network" style={cardStyle}>
            <div style={{ fontSize: "0.8rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0f766e" }}>
              View 2
            </div>
            <h2 style={{ margin: "0.55rem 0 0", fontSize: "1.4rem" }}>Agreement Network</h2>
            <p style={{ margin: "0.75rem 0 0", color: "#475569", lineHeight: 1.6 }}>
              Inspect coder relationships and code-level agreement across the network.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
