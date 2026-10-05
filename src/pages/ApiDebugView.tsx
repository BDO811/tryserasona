import { useAssessment } from "@/context/AssessmentContext";

/**
 * Debug page to inspect the raw API response and transformation
 * Access at: /api-debug?dev=true
 */
const ApiDebugView = () => {
  const { apiResult, visualizedResult, pathway } = useAssessment();
  
  // Check for dev mode
  const searchParams = new URLSearchParams(window.location.search);
  const isDevMode = searchParams.get("dev") === "true";
  
  if (!isDevMode) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">API Debug View</h1>
          <p className="text-white/60">Add ?dev=true to URL to enable debug mode</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">v2 API Response Inspector</h1>
        
        {/* Raw API Result */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-cyan-400">1. Raw API Result (from getJobDetail)</h2>
          <div className="bg-gray-900 rounded-lg p-4 overflow-auto">
            {apiResult ? (
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-words">
                {JSON.stringify(apiResult, null, 2)}
              </pre>
            ) : (
              <p className="text-white/40">No API result available. Complete an assessment to see the raw response.</p>
            )}
          </div>
        </section>
        
        
        {/* Extracted Features */}
        {apiResult && (apiResult as any).explanations?.feature_explanations?.features && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-cyan-400">2. Extracted Features</h2>
            <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-96">
              <pre className="text-xs text-blue-400 font-mono whitespace-pre-wrap break-words">
                {JSON.stringify((apiResult as any).explanations.feature_explanations.features, null, 2)}
              </pre>
            </div>
            <p className="text-white/40 text-sm mt-2">
              Total features: {Object.keys((apiResult as any).explanations.feature_explanations.features || {}).length}
            </p>
          </section>
        )}
        
        {/* Transformed VisualizedResult */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-cyan-400">3. Transformed VisualizedResult (Display Format)</h2>
          <div className="bg-gray-900 rounded-lg p-4 overflow-auto">
            {visualizedResult ? (
              <pre className="text-xs text-purple-400 font-mono whitespace-pre-wrap break-words">
                {JSON.stringify(visualizedResult, null, 2)}
              </pre>
            ) : (
              <p className="text-white/40">No visualized result available. Complete an assessment to see the transformation.</p>
            )}
          </div>
        </section>
        
        {/* Transformation Flow */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-cyan-400">4. Transformation Flow</h2>
          <div className="bg-gray-900 rounded-lg p-4">
            <ol className="list-decimal list-inside space-y-2 text-white/80">
              <li>
                <strong>API Call:</strong> <code className="text-cyan-400">leadgenWellnessAnalyzeAudioSync()</code>
                <br />
                <span className="text-white/60 text-sm">Returns: <code>{`{ job_id: string }`}</code></span>
              </li>
              <li>
                <strong>Poll Job:</strong> <code className="text-cyan-400">pollJobUntilComplete(job_id)</code>
                <br />
                <span className="text-white/60 text-sm">Returns: <code>{`JobDetailResponse { job_id, status, created_at, result }`}</code></span>
              </li>
              <li>
                <strong>Store Raw:</strong> <code className="text-cyan-400">setApiResult(jobDetail.result)</code>
                <br />
                <span className="text-white/60 text-sm">Stored in context as raw object</span>
              </li>
              <li>
                <strong>Transform:</strong> <code className="text-cyan-400">transformApiResultToVisualization(apiResult, pathway, biologicalSex)</code>
                <br />
                <span className="text-white/60 text-sm">Located in: <code>src/lib/v2-api-visual-mapping.ts</code></span>
              </li>
              <li>
                <strong>Store Visualized:</strong> <code className="text-cyan-400">setVisualizedResult(visualized)</code>
                <br />
                <span className="text-white/60 text-sm">Used by: HealthProfile, DetailedAnalysisView components</span>
              </li>
            </ol>
          </div>
        </section>
        
        {/* Where It's Displayed */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-cyan-400">5. Where It's Displayed</h2>
          <div className="bg-gray-900 rounded-lg p-4">
            <ul className="list-disc list-inside space-y-2 text-white/80">
              <li>
                <strong>Dashboard/HealthProfile:</strong> <code className="text-cyan-400">src/components/HealthProfile.tsx</code>
                <br />
                <span className="text-white/60 text-sm">Shows: score, classification, labMetrics, clinicalSubtext, keyStat</span>
              </li>
              <li>
                <strong>Detailed Analysis:</strong> <code className="text-cyan-400">src/pages/DetailedAnalysisView.tsx</code>
                <br />
                <span className="text-white/60 text-sm">Shows: biomarkers, signalQuality, full biomarker definitions</span>
              </li>
              <li>
                <strong>Lab Grid:</strong> <code className="text-cyan-400">src/components/report/BiometricLabGrid.tsx</code>
                <br />
                <span className="text-white/60 text-sm">Shows: labMetrics array in grid format</span>
              </li>
            </ul>
          </div>
        </section>
        
        {/* Current Pathway */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-cyan-400">6. Current Context</h2>
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="space-y-2">
              <p><strong>Pathway:</strong> <span className="text-cyan-400">{pathway || "None"}</span></p>
              <p><strong>Has Raw API Result:</strong> <span className={apiResult ? "text-green-400" : "text-red-400"}>{apiResult ? "Yes" : "No"}</span></p>
              <p><strong>Has Visualized Result:</strong> <span className={visualizedResult ? "text-green-400" : "text-red-400"}>{visualizedResult ? "Yes" : "No"}</span></p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ApiDebugView;
