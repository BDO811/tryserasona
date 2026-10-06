import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { ChevronLeft, FileText, Download } from "lucide-react";
import { useAssessment, BRAND_COLOR } from "@/context/AssessmentContext";
import { toast } from "sonner";
import { BiomarkerDefinition, formatLikelihoodTierForDisplay } from "@/lib/result-types";
import { jsPDF } from "jspdf";
import { getProtocolId, getStatusColorFromLikelihoodTier } from "@/lib/assessment-display-utils";
import { bandColor, bandForSignal, bandLabelForSignal, bandOfLevel, bandScaleOptions } from "@/lib/signal-band";
import { RUNG_RECOMMENDATION, RUNG_SCALE, type HeadlineRung } from "@/lib/result-headline";
import { OptionScale } from "@/components/report/OptionScale";

// Descriptions for audio quality metrics (matching AnalysisFailed page)

const DetailedAnalysisView = () => {
  const navigate = useNavigate();
  const { pathway, visualizedResult, userProfile } = useAssessment();

  useEffect(() => {
    if (!visualizedResult?.biomarkers?.length) {
      navigate("/");
    }
  }, [visualizedResult, navigate]);

  /*
    The outcome phrase and its colour both come from the rung, which is the same
    source the results screen reads.

    They used to come from formatLikelihoodTierForDisplay(likelihoodTier) here
    while the results screen read RUNG_RECOMMENDATION, so one result was shown
    as "Needs Optimization" on one page and "Continue to Monitor" on the other.
    Two computations describing one result can always disagree; one cannot.
  */
  const rung = visualizedResult?.headlineRung as HeadlineRung | undefined;
  const outcomePhrase = rung
    ? RUNG_RECOMMENDATION[rung]
    : formatLikelihoodTierForDisplay(visualizedResult?.likelihoodTier || "");
  const outcomeColour = rung
    ? RUNG_SCALE.find((r) => r.key === rung)?.color ??
      getStatusColorFromLikelihoodTier(visualizedResult?.likelihoodTier || "")
    : getStatusColorFromLikelihoodTier(visualizedResult?.likelihoodTier || "");

  const protocolId = getProtocolId(pathway || "BRAIN_AGE");
  const biomarkers: BiomarkerDefinition[] = visualizedResult?.biomarkers || [];
  const assessmentTitle = pathway === "BRAIN_AGE" ? "Cognitive"
    : pathway === "LONGEVITY" ? "Longevity"
    : pathway === "MENTAL_HEALTH" ? "Mental Health"
    : pathway === "FERTILITY" ? "Fertility"
    : pathway === "WELLNESS" ? "Wellness"
    : pathway === "SPORTS" ? "Sports"
    : "Wellness";
  const signalQuality = visualizedResult?.signalQuality;
  const extendedMetrics = visualizedResult?.extendedMetrics || [];

  if (!visualizedResult || !biomarkers.length) {
    return null;
  }

  // Helper function to convert hex color to RGB array for jsPDF
  const hexToRgb = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
          parseInt(result[1], 16),
          parseInt(result[2], 16),
          parseInt(result[3], 16),
        ]
      : [0, 0, 0];
  };

  /** Colour for a biomarker in the PDF and on the range track. */
  const getBiomarkerColor = (level?: string): string =>
    level ? bandColor(bandOfLevel(level), "light") : BRAND_COLOR;

  const handleDownloadPDF = () => {
    toast.loading("Generating Clinical PDF...", { id: "pdf-gen" });
    
    try {
      // Create PDF document
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const maxWidth = pageWidth - 2 * margin;
      let yPosition = margin;

      // Helper function to add a new page if needed
      const checkPageBreak = (requiredHeight: number) => {
        if (yPosition + requiredHeight > pageHeight - margin) {
          doc.addPage();
          yPosition = margin;
          return true;
        }
        return false;
      };

      // Helper function to add text with word wrapping
      const addWrappedText = (text: string, x: number, y: number, maxWidth: number, fontSize: number, fontStyle: string = "normal") => {
        doc.setFontSize(fontSize);
        doc.setFont("helvetica", fontStyle);
        const lines = doc.splitTextToSize(text, maxWidth);
        doc.text(lines, x, y);
        return lines.length * (fontSize * 0.35); // Approximate line height
      };

      // Header
      doc.setFillColor(194, 65, 12);
      doc.rect(0, 0, pageWidth, 30, "F");
      
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("TECHNICAL APPENDIX", margin, 15);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Protocol: ${protocolId}`, margin, 22);
      
      yPosition = 40;

      // Assessment Title
      doc.setTextColor(194, 65, 12);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(assessmentTitle.toUpperCase(), margin, yPosition);
      yPosition += 8;

      // Metadata: Date, Job ID, Patient Info
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const reportDate = visualizedResult?.createdAt 
        ? new Date(visualizedResult.createdAt).toISOString().split('T')[0].replace(/-/g, '.')
        : new Date().toISOString().split('T')[0].replace(/-/g, '.');
      doc.text(`Date: ${reportDate}`, margin, yPosition);
      yPosition += 5;
      
      if (visualizedResult) {
        doc.text(`Job ID: ${visualizedResult.jobId}`, margin, yPosition);
        yPosition += 5;
      }

      if (userProfile?.fullName) {
        doc.text(`Patient: ${userProfile.fullName}`, margin, yPosition);
        yPosition += 5;
      }

      if (userProfile?.ageRange) {
        const ageLabel = userProfile.ageRange === "under30" ? "Under 30" :
                        userProfile.ageRange === "30-45" ? "30-45" :
                        userProfile.ageRange === "46-60" ? "46-60" : "60+";
        doc.text(`Age Range: ${ageLabel}`, margin, yPosition);
        yPosition += 5;
      }

      yPosition += 8;

       // Prominent Outcome Section - After header, before biomarkers (matching dashboard style)
       if (visualizedResult) {
         checkPageBreak(30);
         const outcomeColor = hexToRgb(outcomeColour);
         const outcomeText = outcomePhrase;
         const classificationText = visualizedResult.classification;
         
         // Center the outcome section
         const centerX = pageWidth / 2;
         
         // Likelihood tier in brackets (like SpectrogramWaveform)
         doc.setFontSize(28);
         doc.setFont("helvetica", "light");
         
         // Calculate text widths for positioning
         const outcomeTextWidth = doc.getTextWidth(outcomeText);
         const bracketWidth = doc.getTextWidth("[");
         const spacing = 2;
         
         // Left bracket (semi-transparent)
         const bracketColor = [Math.round(outcomeColor[0] * 0.25), Math.round(outcomeColor[1] * 0.25), Math.round(outcomeColor[2] * 0.25)];
         doc.setTextColor(bracketColor[0], bracketColor[1], bracketColor[2]);
         doc.text("[", centerX - outcomeTextWidth / 2 - bracketWidth - spacing, yPosition);
         
         // Outcome text
         doc.setTextColor(outcomeColor[0], outcomeColor[1], outcomeColor[2]);
         doc.text(outcomeText, centerX, yPosition, { align: "center" });
         
         // Right bracket (semi-transparent)
         doc.setTextColor(bracketColor[0], bracketColor[1], bracketColor[2]);
         doc.text("]", centerX + outcomeTextWidth / 2 + spacing, yPosition);
         
         yPosition += 10;
         
         // Classification text below (like dashboard)
         doc.setFontSize(11);
         doc.setFont("helvetica", "bold");
         doc.setTextColor(outcomeColor[0], outcomeColor[1], outcomeColor[2]);
         doc.text(classificationText, centerX, yPosition, { align: "center" });
         
         yPosition += 12;
         yPosition += 8; // Extra spacing before biomarkers
       }

      // Section 1: Biometric Results and Descriptions
      checkPageBreak(20);
      doc.setTextColor(194, 65, 12);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("BIOMETRIC RESULTS AND DESCRIPTIONS", margin, yPosition);
      yPosition += 8;

      doc.setDrawColor(200, 200, 200);
      doc.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 5;

      // Note about biomarker subset
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(120, 120, 120);
      const noteText = "Note: We analyze over 1,000 voice biomarkers. The markers shown here are a small subset that are easiest to interpret and most influential in your result.";
      const noteHeight = addWrappedText(noteText, margin, yPosition, maxWidth, 7);
      yPosition += noteHeight + 5;

      biomarkers.forEach((biomarker, index) => {
        // Check if we need a new page
        const biomarkerHeight = 50; // Approximate height per biomarker
        if (checkPageBreak(biomarkerHeight)) {
          // Redraw section header on new page
          doc.setTextColor(194, 65, 12);
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text("BIOMETRIC RESULTS AND DESCRIPTIONS (continued)", margin, yPosition);
          yPosition += 8;
          doc.setDrawColor(200, 200, 200);
          doc.line(margin, yPosition, pageWidth - margin, yPosition);
          yPosition += 5;
        }

        // Biomarker Title
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        const titleHeight = addWrappedText(biomarker.title, margin, yPosition, maxWidth - 40, 10, "bold");
        yPosition += titleHeight + 2;

        // Normal Range - right under the feature name
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        yPosition += 5;

        // Value and Unit - with color coding matching BiometricLabGrid
        const biomarkerColor = hexToRgb(getBiomarkerColor(biomarker.level));
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(biomarkerColor[0], biomarkerColor[1], biomarkerColor[2]);
        doc.text(`${biomarker.value} ${biomarker.unit}`, pageWidth - margin, yPosition, { align: "right" });
        yPosition += 6;

        // Definition
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        const defHeight = addWrappedText(biomarker.definition, margin, yPosition, maxWidth, 9);
        yPosition += defHeight + 3;

        // Present only on a flagged band — the mapper leaves it undefined otherwise.
        if (biomarker.clinicalContext) {
          doc.setFillColor(240, 248, 255);
          doc.rect(margin, yPosition - 2, maxWidth, 15, "F");
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(0, 0, 0);
          doc.text("Clinical Context:", margin + 2, yPosition + 3);
          doc.setFont("helvetica", "normal");
          const contextHeight = addWrappedText(biomarker.clinicalContext, margin + 2, yPosition + 7, maxWidth - 4, 8);
          yPosition += Math.max(contextHeight, 12) + 3;
        }

        yPosition += 3;

        // Separator line
        if (index < biomarkers.length - 1) {
          doc.setDrawColor(220, 220, 220);
          doc.line(margin, yPosition, pageWidth - margin, yPosition);
          yPosition += 5;
        }
      });

      yPosition += 10;

      // Section 2: Signal Quality Report (moved to bottom)
      checkPageBreak(20);
      doc.setTextColor(194, 65, 12);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("SIGNAL QUALITY REPORT", margin, yPosition);
      yPosition += 8;

      doc.setDrawColor(200, 200, 200);
      doc.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 5;

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");

      const signalQualityData: Array<[string, string, string?]> = []; // [label, value, description?]
      
      if (signalQuality?.audioClarity !== undefined) {
        signalQualityData.push(["Audio Clarity", `${signalQuality.audioClarity.toFixed(1)} / 100`]);
      }
      if (signalQuality?.voicePercentage !== undefined) {
        signalQualityData.push(["Voice Percentage", `${(signalQuality.voicePercentage * 100).toFixed(1)}%`]);
      }
      if (signalQuality?.captureBandwidth) {
        signalQualityData.push(["Capture Bandwidth", signalQuality.captureBandwidth]);
      }
      if (signalQuality?.sampleRate) {
        signalQualityData.push(["Sample Rate", signalQuality.sampleRate]);
      }
      if (signalQuality?.duration !== undefined) {
        signalQualityData.push(["Capture Duration", `${signalQuality.duration.toFixed(1)} seconds`]);
      }
      
      // If no audio quality data, show NA
      if (signalQualityData.length === 0) {
        signalQualityData.push(["Audio Quality", "NA"]);
      }

      signalQualityData.forEach(([label, value, description]) => {
        checkPageBreak(description ? 12 : 8);
        doc.setFont("helvetica", "normal");
        doc.text(label + ":", margin, yPosition);
        doc.setFont("helvetica", "bold");
        doc.text(value, margin + 60, yPosition);
        yPosition += 6;
        
        // Add description for PESQ and STOI
        if (description) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          const descHeight = addWrappedText(description, margin, yPosition, maxWidth - 60, 8, "normal");
          yPosition += descHeight + 2;
          doc.setFontSize(9); // Reset font size
          doc.setTextColor(0, 0, 0); // Reset text color
        }
      });

      // Footer on last page
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Page ${i} of ${totalPages}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: "center" }
        );
        doc.text(
          `Generated on ${new Date().toLocaleString()}`,
          pageWidth / 2,
          pageHeight - 5,
          { align: "center" }
        );
      }

      // Generate filename
      const timestamp = new Date().toISOString().split("T")[0];
      const filename = `Clinical_Report_${protocolId}_${timestamp}.pdf`;

      // Save PDF
      doc.save(filename);

      toast.success("PDF Downloaded Successfully", {
        id: "pdf-gen",
        description: `Your clinical report has been saved as ${filename}`,
        duration: 4000,
      });
    } catch (error) {
      console.error("PDF generation failed:", error);
      toast.error("PDF Generation Failed", {
        id: "pdf-gen",
        description: "There was an error generating the PDF. Please try again.",
        duration: 4000,
      });
    }
  };

  const handleBack = () => {
    navigate("/");
  };

  return (
    <motion.div
      className="min-h-screen text-[#1b1510]"
      style={{ backgroundColor: "#fbf7f1" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Navigation Header */}
      <div className="fixed top-0 left-0 right-0 z-50 p-6 md:p-8 pointer-events-none">
        <div className="flex items-center max-w-2xl mx-auto pointer-events-auto">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 font-mono text-xs tracking-widest text-black/50 hover:text-black/80 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>BACK</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      {/* Top margin clears the fixed BACK header above. Without it the card's
          top edge sat under the header and the dark BACK label landed on black. */}
      <div className="max-w-2xl mx-auto px-6 pt-10 pb-16 md:px-10 md:pt-12 rounded-3xl bg-black/[0.92] mt-20 mb-6 md:mt-24 md:mb-10 backdrop-blur-md">
        {/* Header */}
        <motion.div
          className="mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h1 
            className="font-mono text-sm md:text-base uppercase tracking-[0.2em] font-medium mb-2"
            style={{ color: BRAND_COLOR }}
          >
            Technical Appendix: {protocolId}
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#6f6254] mb-3">
            {assessmentTitle} Assessment — Detailed Biomarker Analysis
          </p>
          
          {/* Metadata Header Bar (matching dashboard) */}
          {visualizedResult && (
            <div className="flex flex-col px-4 py-2 border-b border-[#1b1510]/20 font-mono text-[9px] md:text-[10px] uppercase tracking-wider mb-6">
              {/* First Row: Date | Sample Rate | Model */}
              <div className="flex items-center justify-center gap-3 flex-wrap mb-1">
                <span className="text-[#6f6254]">
                  Date: <span className="text-[#1b1510] font-medium">{new Date(visualizedResult.createdAt).toISOString().split('T')[0].replace(/-/g, '.')}</span>
                </span>
                <span className="text-[#574b3f]/50">|</span>
                <span className="text-[#6f6254]">
                  Sample Rate: <span className="text-[#1b1510] font-medium">48kHz</span>
                </span>
                <span className="text-[#574b3f]/50">|</span>
                <span className="text-[#6f6254]">
                  Model: <span className="text-[#1b1510] font-medium">SERASONA-2.0</span>
                </span>
              </div>
              {/* Second Row: Job ID only */}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <span className="text-[#6f6254]">
                  Job ID: <span className="text-[#1b1510] font-medium">{visualizedResult.jobId}</span>
                </span>
              </div>
            </div>
          )}

          {/* Prominent Outcome - Below header, matching dashboard style */}
          {visualizedResult && (
            <div className="mb-8 text-center">
              {/*
                Same assessment scale as the results screen, so the two pages
                agree at a glance. The rung travels on the result alongside the
                classification phrase, computed from one list of levels.
              */}
              {visualizedResult.headlineRung && (
                <div className="max-w-md mx-auto mb-5">
                  <div
                    className="font-mono text-[9px] uppercase tracking-[0.2em] mb-2.5"
                    style={{ color: "#574b3f" }}
                  >
                    Assessment
                  </div>
                  <OptionScale
                    options={RUNG_SCALE}
                    activeKey={visualizedResult.headlineRung}
                    size="lg"
                    surface="light"
                    ariaLabel="Assessment outcome"
                  />
                </div>
              )}

              {/* Likelihood tier in brackets (like SpectrogramWaveform) */}
              <div className="relative inline-flex items-center justify-center mb-3">
                {/* Left Bracket */}
                <span 
                  className="text-4xl md:text-5xl font-extralight font-mono mr-2"
                  style={{ color: `${outcomeColour}40` }}
                >
                  [
                </span>
                
                {/* Likelihood Tier Text */}
                <span
                  className="font-mono text-2xl md:text-3xl font-extralight tracking-tight"
                  style={{ 
                    color: outcomeColour,
                    textShadow: `0 0 40px ${outcomeColour}80, 0 0 80px ${outcomeColour}40`,
                  }}
                >
                  {outcomePhrase}
                </span>
                
                {/* Right Bracket */}
                <span 
                  className="text-4xl md:text-5xl font-extralight font-mono ml-2"
                  style={{ color: `${outcomeColour}40` }}
                >
                  ]
                </span>
              </div>
              
              {/* Classification text below (like dashboard) */}
              <h2 
                className="font-mono text-xs md:text-sm uppercase tracking-[0.25em] font-medium mt-2"
                style={{ 
                  color: outcomeColour,
                  textShadow: `0 0 20px ${outcomeColour}40`,
                }}
              >
                {visualizedResult.classification}
              </h2>
            </div>
          )}
        </motion.div>

        {/* Section 1: Biomarker Definitions */}
        <motion.section
          className="mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-[#1b1510] mb-4 pb-2 border-b border-[#1b1510]/20">
            Biometric Results and Descriptions
          </h2>
          
          <p className="font-mono text-[9px] text-[#6f6254] mb-4">
            Note: We analyze over 1,000 voice biomarkers. The markers shown here are a small subset that are easiest to interpret and most influential in your result.
          </p>
          
          <div className="space-y-1">
            {biomarkers.map((biomarker, index) => (
              <motion.div
                key={biomarker.title}
                className="rounded-lg overflow-hidden"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + index * 0.05 }}
                style={{
                  background: 'rgba(27, 21, 16, 0.9)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <div className="p-4">
                  {/* Title Row */}
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-mono text-sm text-white font-medium">
                        {biomarker.title}
                      </h3>
                    </div>
                    {/*
                      The raw score, kept on the detail page but demoted and
                      labelled. It is a per-sign probability, so it is not the
                      display primitive - the band below is - and the API
                      documents it as internal. Coloured from the band rather
                      than from a z-score ramp, which used the retired emerald.
                    */}
                    <div className="text-right flex-shrink-0">
                      <span
                        className="font-mono text-base font-semibold"
                        style={{
                          color: biomarker.level
                            ? bandColor(bandForSignal(biomarker.technicalName, biomarker.level), "dark")
                            : BRAND_COLOR,
                        }}
                      >
                        {biomarker.value}
                      </span>
                      <span className="font-mono text-xs text-white ml-1">
                        {biomarker.unit}
                      </span>
                      <div className="font-mono text-[8px] uppercase tracking-wider text-white mt-0.5">
                        signal score
                      </div>
                    </div>
                  </div>

                  {/* Where this signal sits, on the same scale as every other */}
                  {biomarker.level && (
                    <div className="mb-3">
                      <OptionScale
                        options={bandScaleOptions(biomarker.technicalName).map((o) => ({
                          ...o,
                          label: bandLabelForSignal(biomarker.technicalName, o.key),
                        }))}
                        activeKey={
                          bandForSignal(biomarker.technicalName, biomarker.level) === "INCONCLUSIVE"
                            ? null
                            : bandForSignal(biomarker.technicalName, biomarker.level)
                        }
                        ariaLabel={`${biomarker.title}: ${bandLabelForSignal(
                          biomarker.technicalName,
                          bandForSignal(biomarker.technicalName, biomarker.level)
                        )}`}
                      />
                    </div>
                  )}

                  {/* Definition */}
                  <p className="font-mono text-[11px] text-white leading-relaxed mb-3">
                    {biomarker.definition}
                  </p>
                  
                  {/* Present only on a flagged band — the mapper leaves it undefined otherwise. */}
                  {biomarker.clinicalContext && (
                    <div 
                      className="rounded px-3 py-2 mb-2"
                      style={{ background: 'rgba(194, 65, 12, 0.05)' }}
                    >
                      <span className="font-mono text-[9px] uppercase tracking-wider text-white block mb-1">
                        Clinical Context
                      </span>
                      <p className="font-mono text-[11px] text-white leading-relaxed">
                        {biomarker.clinicalContext}
                      </p>
                    </div>
                  )}
                  
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Section 1b: Extended Sub-Dimension Metrics (v2 only) */}
        {extendedMetrics.length > 0 && (
          <motion.section
            className="mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-[#1b1510] mb-2 pb-2 border-b border-[#1b1510]/20">
              Sub-Dimension Metrics
            </h2>
            <p className="font-mono text-[9px] text-white leading-relaxed mb-4">
              Each dimension is scored between two anchors. The marker shows where this sample
              sits; the band around it is the variation across segments of the recording.
            </p>

            <div className="space-y-0 divide-y divide-white/5">
              {extendedMetrics.map((metric) => {
                const pct = Math.max(0, Math.min(100, metric.score_mean * 100));
                const spread = Math.max(0, Math.min(50, metric.score_std * 100));
                return (
                  <div key={metric.metric_id} className="py-3">
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-white">
                        {metric.label}
                      </span>
                      <span className="font-mono text-[10px] text-white">
                        {metric.score_mean.toFixed(2)}
                        <span className="text-white"> ± {metric.score_std.toFixed(2)}</span>
                      </span>
                    </div>

                    <div className="relative h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      {/* Segment-to-segment spread */}
                      <div
                        className="absolute inset-y-0 rounded-full"
                        style={{
                          left: `${Math.max(0, pct - spread)}%`,
                          width: `${Math.min(100, spread * 2)}%`,
                          background: 'rgba(255,255,255,0.18)',
                        }}
                      />
                      {/* Mean marker */}
                      <div
                        className="absolute top-1/2 h-3 w-[2px] -translate-y-1/2 rounded-full"
                        style={{ left: `${pct}%`, backgroundColor: getBiomarkerColor(undefined) }}
                      />
                    </div>

                    <div className="flex items-center justify-between mt-1.5">
                      <span className="font-mono text-[8px] uppercase tracking-wider text-white">
                        {metric.low_anchor}
                      </span>
                      <span className="font-mono text-[8px] uppercase tracking-wider text-white">
                        {metric.high_anchor}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.section>
        )}

        {/* Section 2: Signal Quality Report */}
        {signalQuality && (
          <motion.section
            className="mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-[#1b1510] mb-4 pb-2 border-b border-[#1b1510]/20">
              Signal Quality Report
            </h2>
            
            <div className="space-y-0 divide-y divide-white/5">
              {signalQuality.audioClarity !== undefined && (
                <div className="flex items-center justify-between py-3">
                  <span className="font-mono text-xs text-white">Audio Clarity</span>
                  <span className="font-mono text-xs text-white">
                    {signalQuality.audioClarity.toFixed(1)} / 100
                  </span>
                </div>
              )}
              {signalQuality.voicePercentage !== undefined && (
                <div className="flex items-center justify-between py-3">
                  <span className="font-mono text-xs text-white">Voice Percentage</span>
                  <span className="font-mono text-xs text-white">
                    {(signalQuality.voicePercentage * 100).toFixed(1)}%
                  </span>
                </div>
              )}
              {signalQuality.captureBandwidth && (
                <div className="flex items-center justify-between py-3">
                  <span className="font-mono text-xs text-white">Capture Bandwidth</span>
                  <span className="font-mono text-xs text-white">
                    {signalQuality.captureBandwidth}
                  </span>
                </div>
              )}
              {signalQuality.sampleRate && (
                <div className="flex items-center justify-between py-3">
                  <span className="font-mono text-xs text-white">Sample Rate</span>
                  <span className="font-mono text-xs text-white">
                    {signalQuality.sampleRate}
                  </span>
                </div>
              )}
              {signalQuality.duration !== undefined && (
                <div className="flex items-center justify-between py-3">
                  <span className="font-mono text-xs text-white">Capture Duration</span>
                  <span className="font-mono text-xs text-white">
                    {signalQuality.duration.toFixed(1)} seconds
                  </span>
                </div>
              )}
            </div>
          </motion.section>
        )}

        {/* Section 3: Export */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-[#1b1510] mb-4 pb-2 border-b border-[#1b1510]/20">
            Export Report
          </h2>
          
          <button
            onClick={handleDownloadPDF}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-lg font-mono text-xs uppercase tracking-widest transition-all duration-300 hover:scale-[1.01]"
            style={{
              background: 'rgba(11, 11, 10, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.7)',
            }}
          >
            <FileText className="w-4 h-4" />
            <span>Download Clinical PDF</span>
            <Download className="w-3.5 h-3.5 opacity-50" />
          </button>
          
          <p className="font-mono text-[9px] text-white text-center mt-3">
            Includes full biomarker data, analysis, and explanations.
          </p>
        </motion.section>
      </div>
    </motion.div>
  );
};

export default DetailedAnalysisView;