/**
 * A scale of every possible outcome, with the one a result landed on lit and
 * the ones it did not at half opacity.
 *
 * Used twice on the results screen: once at the top for the four assessment
 * rungs, once per signal row for the five severity bands. Position is fixed and
 * identical every time, so where a result sits is read in place rather than by
 * comparing bar lengths between rows — which is what the single-word-plus-bar
 * treatment could not do.
 *
 * The breathing highlight lives in index.css as .animate-scale-breathe, driven
 * by the custom properties set below.
 */

export interface ScaleOption {
  key: string;
  label: string;
  /** Hex for a dark surface. Tints below are derived from it. */
  color: string;
  /** Hex for a light surface. The dark ramp is unreadable on beige. */
  colorLight?: string;
}

interface OptionScaleProps {
  options: ScaleOption[];
  /** The option to light. Null lights nothing, for an unreadable result. */
  activeKey: string | null;
  /** "lg" for the assessment scale at the top, "sm" for a signal row. */
  size?: "sm" | "lg";
  /** Which ground the scale sits on. Picks the legible half of each colour. */
  surface?: "dark" | "light";
  /** Opacity for the options a result is not. Defaults to DIM. */
  dimOpacity?: number;
  ariaLabel: string;
}

/** Half opacity for the options a result is not. */
const DIM = 0.5;

function tint(hex: string, alpha: number): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return "transparent";
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(match[i], 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const OptionScale = ({
  options,
  activeKey,
  size = "sm",
  surface = "dark",
  dimOpacity = DIM,
  ariaLabel,
}: OptionScaleProps) => {
  const isLarge = size === "lg";

  return (
    /*
      Two different layouts on purpose.

      The five band labels are all short and of similar length, so equal columns
      give them the even spacing that makes the row read as a scale.

      The four assessment labels are not: "NEEDS IMPROVEMENT" is nearly three
      times the width of "STEADY". On equal quarter-columns its longest word
      cannot fit on one line, and on a fixed column it broke out of its own
      padding and printed past the lit box's border.

      These are laid out edge to edge with each cell hugging its own label, and
      the long one is allowed to wrap. At 2x DPR the results panel gives about
      492px of content while the four labels need roughly 512px on one line, so
      wrapping is the honest outcome; what matters is that the cell is sized to
      the wrapped text and keeps its padding, so nothing touches a border.
    */
    <div
      role="group"
      aria-label={ariaLabel}
      className={
        isLarge
          ? "flex flex-wrap items-stretch justify-between gap-x-2 gap-y-1"
          : "grid gap-1 items-stretch"
      }
      style={
        isLarge
          ? undefined
          : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }
      }
    >
      {options.map((option) => {
        const isActive = option.key === activeKey;
        const color =
          surface === "light" ? option.colorLight ?? option.color : option.color;
        return (
          /*
            Flex-centred and full height. As a plain text span the cell
            stretched to the tallest option in the row, and any single-line
            label sat at the top of its own box - so the lit box looked like it
            had its word offset upward.
          */
          <span
            key={option.key}
            aria-current={isActive ? "true" : undefined}
            className={`flex items-center justify-center h-full text-center font-mono uppercase rounded leading-tight ${
              isLarge
                ? `tracking-[0.08em] py-2.5 px-3 ${
                    isActive
                      ? "text-[13px] md:text-[16px] font-semibold"
                      : "text-[12px] md:text-[14px] font-medium"
                  }`
                : `tracking-[0.06em] py-1 px-0.5 whitespace-nowrap ${
                    isActive
                      ? "text-[9px] md:text-[10px] font-semibold"
                      : "text-[8px] md:text-[9px]"
                  }`
            } ${isActive ? "animate-scale-breathe" : ""}`}
            style={{
              color,
              opacity: isActive ? 1 : dimOpacity,
              // Read by the keyframes; harmless on the dimmed options.
              ["--scale-color" as string]: color,
              // A touch more fill on a light ground: the same alpha that reads
              // as a glow on black barely registers against beige.
              ["--scale-tint-lo" as string]: tint(color, surface === "light" ? 0.14 : 0.1),
              ["--scale-tint-hi" as string]: tint(
                color,
                surface === "light" ? (isLarge ? 0.3 : 0.24) : isLarge ? 0.24 : 0.2
              ),
              ["--scale-glow" as string]: isLarge ? "14px" : "9px",
            }}
          >
            {option.label}
          </span>
        );
      })}
    </div>
  );
};

export default OptionScale;
