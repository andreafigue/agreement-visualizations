import AgreementTimeline from "@/app/components/AgreementTimeline";
import latestRun from "@/data/latest-run.json";

export default function AgreementTimelinePage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <AgreementTimeline initialRunData={latestRun} />
    </main>
  );
}
