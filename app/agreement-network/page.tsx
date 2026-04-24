import CoderNetwork from "@/app/components/CoderNetwork";
import latestRun from "@/data/latest-run.json";

export default function AgreementNetworkPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <CoderNetwork initialRunData={latestRun} />
    </main>
  );
}
