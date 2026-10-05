import { useAssessment } from "@/context/AssessmentContext";

const Dashboard = () => {
  const { visualizedResult } = useAssessment();

  if (!visualizedResult) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#DBCCB1" }}>
        <div className="text-center">
          <p className="text-black/60 mb-4">No assessment data available</p>
          <p className="text-black/40 text-sm">Complete an assessment to view your dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#DBCCB1" }}>
      <div className="text-center">
        <p className="text-black/60 mb-4">Dashboard requires archetype data</p>
        <p className="text-black/40 text-sm">Please complete the full assessment flow to see your results</p>
      </div>
    </div>
  );
};

export default Dashboard;
