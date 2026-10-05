import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useAssessment } from "@/context/AssessmentContext";
import { useVoiceHistory } from "@/hooks/use-voice-history";
import { LongitudinalChart } from "@/components/report/LongitudinalChart";
import { formatSigned } from "@/lib/longitudinal";

const TAN = "#B79862";
const AMBER = "#FFC163";
const GREEN = "#4CAF6E";

/**
 * Longitudinal analysis: the user's own history per signal, rather than a
 * single reading. Each signal is reported as a position relative to that user's
 * recent readings plus a direction of travel, per the engine's tracking rules.
 */
const LongitudinalView = () => {
  const navigate = useNavigate();
  const { userProfile } = useAssessment();
  const { loading, sessions, signals } = useVoiceHistory();

  const email = userProfile.email?.trim() || "";

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "#DBCCB1" }}>
      <div className="mx-auto max-w-3xl px-4 pt-20 pb-16 md:pt-24">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em]"
          style={{ color: "#231200" }}
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <h1 className="mb-2 text-3xl md:text-4xl" style={{ color: "#231200" }}>
          Your history
        </h1>
        <p className="mb-8 max-w-xl font-mono text-[11px] leading-relaxed" style={{ color: "#4B2700" }}>
          Each reading is placed against your own recent readings, so it can be reported as a
          deviation and a direction rather than a bare number. A score is the likelihood a signal is
          present, not how severe it is, and none of this is a diagnosis.
        </p>

        {!email ? (
          <EmptyState
            headline="No email on this session"
            body="History is kept per person, keyed on the email entered at the start of a screening. Run a screening with an email to start a history."
          />
        ) : loading ? (
          <EmptyState headline="Loading your history" body="Fetching your previous sessions." />
        ) : signals.length === 0 ? (
          <EmptyState
            headline="No sessions on record yet"
            body="Once you have completed a screening, each signal gets its own series here."
          />
        ) : (
          <>
            <div
              className="mb-8 flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded-lg px-4 py-3"
              style={{ backgroundColor: "rgba(0,0,0,0.06)" }}
            >
              <Stat label="sessions on record" value={String(sessions.length)} />
              <Stat label="signals tracked" value={String(signals.length)} />
              <Stat
                label="baseline status"
                value={signals.some((s) => s.read.provisional) ? "partly provisional" : "established"}
              />
            </div>

            <div className="flex flex-col gap-8">
              {signals.map((signal, index) => (
                <motion.section
                  key={signal.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.4 }}
                >
                  <LongitudinalChart read={signal.read} label={signal.label} />

                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                    {signal.sinceLastVisit ? (
                      <Readout
                        label="change since last visit"
                        value={formatSigned(signal.sinceLastVisit.change)}
                        color={
                          Math.abs(signal.sinceLastVisit.change) < 0.02
                            ? TAN
                            : signal.sinceLastVisit.change > 0
                            ? AMBER
                            : GREEN
                        }
                      />
                    ) : (
                      <Readout label="change since last visit" value="first visit" color={TAN} />
                    )}
                    {signal.read.provisional ? (
                      <Readout label="read" value="provisional, under 3 sessions" color={TAN} />
                    ) : (
                      <Readout
                        label="direction"
                        value={signal.read.direction ?? "flat"}
                        color={signal.read.direction === "flat" ? TAN : AMBER}
                      />
                    )}
                  </div>
                </motion.section>
              ))}
            </div>

            <p
              className="mt-10 font-mono text-[10px] leading-relaxed"
              style={{ color: "#4B2700" }}
            >
              Recent sessions weigh more, so the baseline moves as new readings arrive. Repeated
              recordings in one sitting count once and cannot move it. A direction is reported only
              past your own spread, and under three sessions no baseline is reported at all.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: "#4B2700" }}>
      {label}
    </div>
    <div className="font-mono text-base" style={{ color: "#231200" }}>
      {value}
    </div>
  </div>
);

const Readout = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div>
    <div className="font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: "#4B2700" }}>
      {label}
    </div>
    <div className="font-mono text-xs uppercase tracking-wide" style={{ color }}>
      {value}
    </div>
  </div>
);

const EmptyState = ({ headline, body }: { headline: string; body: string }) => (
  <div className="rounded-lg px-5 py-6" style={{ backgroundColor: "rgba(0,0,0,0.06)" }}>
    <h2 className="mb-1.5 font-mono text-xs uppercase tracking-[0.18em]" style={{ color: "#231200" }}>
      {headline}
    </h2>
    <p className="font-mono text-[11px] leading-relaxed" style={{ color: "#4B2700" }}>
      {body}
    </p>
  </div>
);

export default LongitudinalView;
