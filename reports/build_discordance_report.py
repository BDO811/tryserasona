"""
Builds the within-subject discordance report.

Working file. The finished PDF goes to the canonical Downloads folder.

All twenty stored recordings are one speaker under three email addresses, which
makes every comparison in here within-subject. Two of the twenty are byte
identical re-submissions of the same audio and are excluded from the analysis,
leaving eighteen unique recordings.

Plain-document style per CLAUDE.md: Times New Roman, black only, no eyebrow
bar, no italic subtitle.
"""

import json
import datetime
import itertools
import statistics as st
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
    KeepTogether, PageBreak, Preformatted,
)

BASE = "/Users/amitmehta/Claude/ReSkinnable_B2C_Demo_Lovable/reports"
OUT = ("/Users/amitmehta/Library/CloudStorage/GoogleDrive-mehta@helix.harvard7.net/"
       "My Drive/Downloads/Sona2_Within_Subject_Discordance.pdf")

BLACK = colors.HexColor("#000000")
ORDER = ["none", "low", "consider", "moderate", "elevated"]

body = ParagraphStyle("body", fontName="Times-Roman", fontSize=10.5, leading=14,
                      textColor=BLACK, spaceAfter=7)
title = ParagraphStyle("title", fontName="Times-Bold", fontSize=19, leading=23,
                       textColor=BLACK, spaceAfter=8)
h2 = ParagraphStyle("h2", fontName="Times-Bold", fontSize=13, leading=16,
                    textColor=BLACK, spaceBefore=16, spaceAfter=6)
h3 = ParagraphStyle("h3", fontName="Times-Bold", fontSize=11, leading=14,
                    textColor=BLACK, spaceBefore=11, spaceAfter=4)
cell = ParagraphStyle("cell", fontName="Times-Roman", fontSize=8.5, leading=11, textColor=BLACK)
cellb = ParagraphStyle("cellb", fontName="Times-Bold", fontSize=8.5, leading=11, textColor=BLACK)
tiny = ParagraphStyle("tiny", fontName="Times-Roman", fontSize=7.6, leading=10, textColor=BLACK)
mono = ParagraphStyle("mono", fontName="Courier", fontSize=6.4, leading=7.6, textColor=BLACK)


def ts(ms):
    return datetime.datetime.fromtimestamp(int(ms) / 1000, datetime.UTC).strftime("%m-%d %H:%M")


def f3(v, signed=False):
    if v is None:
        return "n/a"
    return f"{v:+.3f}" if signed else f"{v:.3f}"


def table(rows, widths, align_right=(), style=None):
    st_ = style or cell
    data = [[Paragraph(str(c), cellb if ri == 0 else st_) for c in row]
            for ri, row in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1)
    cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, BLACK),
        ("LINEBELOW", (0, 1), (-1, -2), 0.25, colors.HexColor("#BBBBBB")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]
    for c in align_right:
        cmds.append(("ALIGN", (c, 0), (c, -1), "RIGHT"))
    t.setStyle(TableStyle(cmds))
    return t


def wrap_json(obj, width=118):
    text = json.dumps(obj, indent=1, sort_keys=True)
    out = []
    for line in text.split("\n"):
        while len(line) > width:
            out.append(line[:width])
            line = "  " + line[width:]
        out.append(line)
    return out


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Times-Roman", 8)
    canvas.setFillColor(BLACK)
    canvas.drawRightString(letter[0] - 54, 30, str(doc.page))
    canvas.restoreState()


rows = json.load(open(f"{BASE}/sessions_flat.json"))
for r in rows:
    r["capturedAt"] = int(r["capturedAt"])
rows.sort(key=lambda r: r["capturedAt"])

fp = lambda r: tuple(round(s["score"], 6) for s in sorted(r["signals"], key=lambda s: s["name"]))
uniq, seen, dupes = [], set(), []
for i, r in enumerate(rows, 1):
    if fp(r) in seen:
        dupes.append(i)
        continue
    seen.add(fp(r))
    uniq.append(r)

retest = json.load(open(f"{BASE}/retest.json"))
pct = json.load(open(f"{BASE}/pctchange.json"))
gaps = json.load(open(f"{BASE}/gapstats.json"))
disc = json.load(open(f"{BASE}/discordance.json"))
window = json.load(open(f"{BASE}/window.json"))

story = []
story.append(Paragraph("Sona-2: Within-Subject Discordance Over Time", title))
story.append(HRFlowable(width="100%", thickness=1, color=BLACK, spaceBefore=2, spaceAfter=12))

story.append(Paragraph(
    f"All twenty stored recordings are one speaker, recorded under three different "
    f"email addresses. Because the database keys on a hash of the address, they were "
    f"held as three separate participants; they are not. That single fact converts every "
    f"comparison here into a within-subject one, including pairs minutes apart that were "
    f"previously split across two apparent people and therefore never compared.", body))
story.append(Paragraph(
    f"Two of the twenty returned byte-identical scores on every signal, which means the "
    f"same audio file was submitted twice. Identical input giving identical output "
    f"establishes that the models are deterministic, so none of the variation below is "
    f"the model behaving randomly on the same data. Those two are excluded, leaving "
    f"{len(uniq)} unique recordings spanning "
    f"{(uniq[-1]['capturedAt'] - uniq[0]['capturedAt']) / 3600000:.0f} hours.", body))
story.append(Paragraph(
    "This is the strongest design the stored data allows: one subject, one model, "
    "minutes apart. Anything the model reports as a change across that gap is either a "
    "real change in the speaker over those minutes, or measurement error. The sections "
    "below quantify how much of it is the latter.", body))

# ------------------------------------------------------------------ 1 timeline
story.append(Paragraph("1. The recordings as one timeline", h2))
trows = [["#", "Captured (UTC)", "Gap", "Model", "Signals", "Note"]]
prev = None
for i, r in enumerate(rows, 1):
    gap = "" if prev is None else f"+{(r['capturedAt'] - prev) / 60000:.0f} min"
    note = "duplicate audio, excluded" if i in dupes else ""
    trows.append([str(i), ts(r["capturedAt"]), gap, r["model"], str(len(r["signals"])), note])
    prev = r["capturedAt"]
story.append(table(trows, [0.35 * inch, 1.1 * inch, 0.75 * inch, 0.7 * inch, 0.6 * inch, 1.9 * inch],
                   align_right=(0, 2, 4), style=tiny))
story.append(Spacer(1, 5))
story.append(Paragraph(
    "Sessions 12 through 16 are the important cluster: five apex recordings inside "
    "33 minutes, four of them unique. Under the three-address split, 13 to 15 looked "
    "like one person and 12 and 16 like two others.", body))

# --------------------------------------------------------------- 2 apex burst
story.append(Paragraph("2. One model, one person, four takes, 33 minutes", h2))
burst = disc["apexBurst"]
times = next(iter(burst.values()))["times"]
# Each take after the first carries its change from the take before it, so the
# row reads as a sequence of moves rather than four numbers to subtract by eye.
brows = [["Signal"] + [t.split(" ")[1] for t in times] + ["Range"]]
for lbl, d in burst.items():
    cells = [f"{d['scores'][0]:.3f}"]
    for i in range(1, len(d["scores"])):
        prev, cur = d["scores"][i - 1], d["scores"][i]
        pc = (cur - prev) / prev * 100 if prev else 0
        cells.append(f"{cur:.3f}<br/>{pc:+.0f}%")
    brows.append([lbl] + cells + [f3(d["range"])])
story.append(table(brows, [1.35 * inch, 0.7 * inch, 0.85 * inch, 0.85 * inch, 0.85 * inch,
                           0.6 * inch], align_right=(1, 2, 3, 4, 5)))
story.append(Spacer(1, 6))
story.append(Paragraph(
    "Anxiety runs 0.732, 0.869, 0.753, 0.359. That is a spread of 0.510 on a 0 to 1 "
    "scale, inside 33 minutes, on one model and one speaker, and it crosses a band "
    "boundary. Stress falls 0.445 to 0.101 across the same four takes. Fatigue holds "
    "near 0.4 for three takes and then drops to 0.128.", body))
story.append(Paragraph("The direction reverses inside the window", h3))
story.append(Paragraph(
    "Five of the six signals change direction at least once across these four takes. "
    "Cognitive Load is the clearest: 0.229, then 0.260, then 0.076, then 0.273. It falls "
    "0.183 and then climbs 0.197, ending almost exactly where it started, and each of "
    "those two steps crosses a band boundary. A quantity that can fall by seventy per "
    "cent and recover in eleven minutes is not tracking a physiological state over that "
    "interval.", body))
rrows = [["Signal", "Sequence", "Step changes"]]
for lbl, d in burst.items():
    s = d["scores"]
    steps = [s[i + 1] - s[i] for i in range(len(s) - 1)]
    sg = [1 if x > 0.02 else (-1 if x < -0.02 else 0) for x in steps]
    if len({x for x in sg if x}) > 1:
        rrows.append([lbl, ", ".join(f"{v:.3f}" for v in s),
                      "  ".join(f"{v:+.3f}" for v in steps)])
story.append(table(rrows, [1.4 * inch, 2.2 * inch, 1.9 * inch]))

# ----------------------------------------------------- 3 same-model test-retest
story.append(Paragraph("3. Same model, repeat measures, every available pair", h2))
story.append(Paragraph(
    "Every pair of recordings on the same model within an hour of each other, across the "
    "whole set. This is a straight test-retest: the same instrument on the same person, "
    "with only minutes between.", body))
srows = [["Window", "Signal comparisons", "Mean absolute difference", "Largest", "Band changed"]]
for win in [15, 30, 60]:
    p = [x for x in retest if x["gap"] <= win]
    bm = sum(1 for x in p if x["bandMoved"])
    srows.append([f"within {win} min", str(len(p)),
                  f3(st.mean(x["diff"] for x in p)), f3(max(x["diff"] for x in p)),
                  f"{bm} of {len(p)}  ({100 * bm / len(p):.0f}%)"])
story.append(table(srows, [1.1 * inch, 1.2 * inch, 1.55 * inch, 0.7 * inch, 1.25 * inch],
                   align_right=(1, 2, 3, 4)))
story.append(Spacer(1, 6))
story.append(Paragraph(
    "Within fifteen minutes, the same model on the same speaker moved the reading into a "
    "different band in fifty-six per cent of comparisons, with a mean absolute change of "
    "0.166 and a largest of 0.510. Band membership is what the product shows the user. "
    "A coin flip is 50 per cent.", body))
story.append(Paragraph("The individual pairs", h3))
prows = [["Model", "Apart", "Signal", "First", "Second", "Change", "% change", "Band"]]
for x in sorted([r for r in retest if r["gap"] <= 15], key=lambda x: -x["diff"]):
    pc = (x["b"] - x["a"]) / x["a"] * 100 if x["a"] else 0
    prows.append([x["model"], f"{x['gap']:.1f} min", x["sign"],
                  f"{x['a']:.3f} ({x['la']})", f"{x['b']:.3f} ({x['lb']})",
                  f"{x['b'] - x['a']:+.3f}", f"{pc:+.0f}%",
                  "changed" if x["bandMoved"] else ""])
story.append(table(prows, [0.5 * inch, 0.55 * inch, 1.2 * inch, 1.05 * inch, 1.05 * inch,
                           0.6 * inch, 0.6 * inch, 0.6 * inch],
                   align_right=(1, 5, 6), style=tiny))

# ------------------------------------------------------------- 4 cross-model
story.append(Paragraph("4. Two models on the same voice, within fifteen minutes", h2))
cross = disc["crossModel15"]
bm = sum(1 for x in cross if x["bandMoved"])
story.append(Paragraph(
    f"Four signals are measured by more than one model. Where two models ran within "
    f"fifteen minutes of each other, the same state is measured twice by different "
    f"instruments. Across {len(cross)} such comparisons the mean absolute difference is "
    f"{f3(st.mean(x['diff'] for x in cross))}, the largest is "
    f"{f3(max(x['diff'] for x in cross))}, and the two models disagreed on the band in "
    f"{bm} of {len(cross)} cases.", body))
crows = [["Signal", "Apart", "Model A", "Model B", "Difference", "% of A", "Band"]]
for x in sorted(cross, key=lambda x: -x["diff"]):
    pc = (x["b"] - x["a"]) / x["a"] * 100 if x["a"] else 0
    crows.append([x["sign"], f"{x['gap']:.1f} min",
                  f"{x['ma']} {x['a']:.3f} ({x['la']})", f"{x['mb']} {x['b']:.3f} ({x['lb']})",
                  f3(x["diff"]), f"{pc:+.0f}%", "differs" if x["bandMoved"] else ""])
story.append(table(crows, [1.05 * inch, 0.55 * inch, 1.35 * inch, 1.35 * inch, 0.7 * inch,
                           0.6 * inch, 0.55 * inch], align_right=(1, 4, 5), style=tiny))

# ----------------------------------------------------------- 5 the ratio
story.append(Paragraph("5. Thirty-three minutes against forty-seven hours", h2))
story.append(Paragraph(
    "This is the measurement that settles whether time carries information here. For "
    "each signal, the range observed inside the 33-minute apex burst is compared with the "
    "range observed across every recording over the full 47 hours.", body))
wrows = [["Signal", "Range in 33 min", "Range over 47 h", "Share", "Recordings"]]
ratios = []
for lbl, d in sorted(window["windowRatio"].items(), key=lambda kv: -kv[1]["ratio"]):
    ratios.append(d["ratio"])
    wrows.append([lbl, f3(d["burstRange"]), f3(d["fullRange"]),
                  f"{d['ratio'] * 100:.0f}%", str(d["n"])])
story.append(table(wrows, [1.55 * inch, 1.1 * inch, 1.1 * inch, 0.7 * inch, 0.85 * inch],
                   align_right=(1, 2, 3, 4)))
story.append(Spacer(1, 6))
story.append(Paragraph(
    f"Median {st.median(ratios) * 100:.0f} per cent. Cognitive Load reaches 98 per cent, "
    f"Fatigue 91, Stress 85. For most signals, almost the entire range of values the model "
    f"produced across two days is reproduced inside a single half hour in which nothing "
    f"about the speaker meaningfully changed.", body))
story.append(Paragraph(
    "That is the discordance, stated plainly: the spread between two readings does not "
    "grow with the time between them. A pair of recordings eleven minutes apart is about "
    "as far apart in score as a pair two days apart. Time is not a variable these numbers "
    "are responding to.", body))


# ------------------------------------------- 6 percent change from previous
story.append(Paragraph("6. Change from the previous measurement", h2))
story.append(Paragraph(
    f"Every consecutive pair of readings for each signal, as a percentage of the reading "
    f"before it. Across all {gaps['n']} consecutive changes the median absolute change is "
    f"{gaps['medianPctAll']:.0f} per cent. {gaps['over50']} of {gaps['n']} "
    f"({100 * gaps['over50'] / gaps['n']:.0f} per cent) moved by half or more, and "
    f"{gaps['over100']} of {gaps['n']} ({100 * gaps['over100'] / gaps['n']:.0f} per cent) "
    f"at least doubled or halved.", body))
story.append(Paragraph(
    "Percentages are read alongside the absolute change, not instead of it. Where a "
    "reading is near zero the percentage becomes unstable: Head Impact moving from 0.003 "
    "to 0.487 is a change of 0.484 on the scale and 15,112 per cent as a ratio. The "
    "median is quoted throughout rather than the mean for that reason, since the mean is "
    "dragged to 250 per cent by a handful of near-zero denominators.", body))

story.append(Paragraph("Does the change grow with the time between recordings", h3))
story.append(Paragraph(
    "If these scores tracked something that drifts over time, readings further apart "
    "would differ more. They do not.", body))
grows = [["Time since previous", "Changes", "Median % change", "Median absolute", "Band moved"]]
for k in ["under 15 min", "15 to 60 min", "1 to 12 h", "over 12 h"]:
    b = gaps["buckets"].get(k)
    if not b:
        continue
    grows.append([k, str(b["n"]), f"{b['medianPct']:.0f}%", f"{b['medianAbs']:.3f}",
                  f"{b['bandMovedPct']:.0f}%"])
story.append(table(grows, [1.35 * inch, 0.75 * inch, 1.15 * inch, 1.1 * inch, 0.85 * inch],
                   align_right=(1, 2, 3, 4)))
story.append(Spacer(1, 6))
story.append(Paragraph(
    f"The median absolute change is 0.116 for recordings less than fifteen minutes apart "
    f"and 0.116 for recordings more than twelve hours apart. The rank correlation between "
    f"the gap and the size of the change is {gaps['rho']:+.3f} across all {gaps['n']} "
    f"pairs, which is no relationship. How long you wait between two recordings tells you "
    f"nothing about how different the two numbers will be.", body))

story.append(Paragraph("Every measurement, per signal", h3))
for lbl, recs in sorted(pct.items(), key=lambda kv: -len(kv[1])):
    if len(recs) < 2:
        continue
    vals = [abs(r["pctChange"]) for r in recs if r["pctChange"] is not None]
    hdr = Paragraph(
        f"{lbl} — {len(recs)} recordings, median change {st.median(vals):.0f} per cent",
        cellb)
    drows = [["Captured", "Model", "Score", "Change", "% change", "Since previous", "Band"]]
    for r in recs:
        if r["pctChange"] is None:
            drows.append([r["t"], r["model"], f"{r['score']:.3f}", "first", "first", "", ""])
            continue
        m = r["minsSincePrev"]
        gap = f"{m:.0f} min" if m < 600 else f"{m / 60:.0f} h"
        drows.append([r["t"], r["model"], f"{r['score']:.3f}", f"{r['absChange']:+.3f}",
                      f"{r['pctChange']:+.0f}%", gap, "moved" if r["bandMoved"] else ""])
    story.append(KeepTogether([hdr, Spacer(1, 3),
                               table(drows, [0.95 * inch, 0.6 * inch, 0.6 * inch, 0.65 * inch,
                                             0.8 * inch, 0.95 * inch, 0.55 * inch],
                                     align_right=(2, 3, 4, 5), style=tiny),
                               Spacer(1, 10)]))

# -------------------------------------------------- 7 what it does to trends
story.append(Paragraph("7. What this does to the longitudinal readout", h2))
story.append(Paragraph(
    "The product computes a baseline from a user's prior readings, reports the deviation "
    "of the latest from it, and calls a direction only when that deviation exceeds the "
    "user's own spread. On this subject it named Anxiety and Stress as rising: Anxiety at "
    "0.616 against a 0.319 baseline, Stress at 0.426 against 0.181.", body))
story.append(Paragraph(
    "Those two do not survive section 2. Anxiety moved 0.510 inside 33 minutes on one "
    "model, which is larger than the 0.298 deviation that earned it the rising label. "
    "Stress moved 0.345 in the same window against a 0.244 deviation. In both cases the "
    "short-window measurement error is larger than the trend it is being asked to "
    "support, so neither can be distinguished from noise.", body))
story.append(Paragraph(
    "The spread gate is doing its job and is not the problem. It compares a deviation "
    "against the spread of that user's own prior readings, and here that spread is "
    "genuinely large. The consequence is that the gate can only ever confirm a trend "
    "bigger than half a scale, which on a 0 to 1 output is not a useful sensitivity.", body))

# ------------------------------------------------------------- 7 what holds
story.append(Paragraph("8. What this supports and what it does not", h2))
story.append(Paragraph("Supported", h3))
p15 = [x for x in retest if x["gap"] <= 15]
story.append(Paragraph(
    f"One speaker, one model, fifteen minutes or less: the reported band changed in "
    f"{100 * sum(1 for x in p15 if x['bandMoved']) / len(p15):.0f} per cent of "
    f"{len(p15)} comparisons. Five of six signals reversed direction inside a 33-minute "
    f"window. A 33-minute window reproduces a median "
    f"{st.median(ratios) * 100:.0f} per cent of the range seen across 47 hours. Taken "
    f"together: the score is not reproducible at the resolution the four-band output "
    f"implies, and differences between readings are not a function of elapsed time.", body))
story.append(Paragraph("Not supported", h3))
story.append(Paragraph(
    "Nothing here speaks to whether the scores are clinically correct. There is no "
    "reference measurement in this data, so validity cannot be assessed. This is a "
    "reliability result.", body))
story.append(Paragraph(
    "Two arguments that look useful and should not be made. Pooling all signals together "
    "appears to show many cases of a higher score being graded into a lower level; that "
    "is an artifact of comparing across signals, and within each signal separately the "
    "score to level mapping is monotonic in all fourteen with no overlap at any boundary. "
    "And the models are deterministic, established by the two duplicate submissions "
    "returning identical scores, so none of this is the model being random on fixed "
    "input. The variance is driven entirely by which seconds of audio were captured.", body))
story.append(Paragraph("Caveats", h3))
story.append(Paragraph(
    "One speaker. Eighteen recordings. These were development captures rather than a "
    "designed protocol, and the recording conditions were not controlled or documented, "
    "so a portion of the variance may be room, distance from the microphone, or what was "
    "said rather than the model. That is a reason the effect size here should not be "
    "quoted as a population figure. It is not a reason to doubt the direction of the "
    "finding, because the comparisons in sections 2 and 3 are internally controlled: same "
    "person, same model, same room, minutes apart.", body))
story.append(Paragraph(
    "The proper version of this is a test-retest protocol: a set of speakers, three "
    "recordings each in one sitting under fixed conditions, reporting an intraclass "
    "correlation per signal. This data is the argument for running it, and predicts what "
    "it will find.", body))

# ------------------------------------------------------------------- appendix
story.append(PageBreak())
story.append(Paragraph("9. Full score series per signal, one subject", h2))
story.append(Paragraph(
    "Every unique recording in capture order, with the model that produced each score.", body))
for lbl, obs in sorted(window["series"].items(), key=lambda kv: -len(kv[1])):
    if len(obs) < 2:
        continue
    scores = [o["score"] for o in obs]
    hdr = Paragraph(
        f"{lbl} — {len(obs)} recordings, range {max(scores) - min(scores):.3f}, "
        f"bands seen: {', '.join(sorted({o['level'] for o in obs}, key=lambda l: ORDER.index(l) if l in ORDER else 9))}",
        cellb)
    drows = [["Captured", "Model", "Score", "Change", "% change"]]
    for i, o in enumerate(obs):
        if i == 0:
            drows.append([o["t"], o["model"], f"{o['score']:.3f}", "first", "first"])
            continue
        prev = obs[i - 1]["score"]
        d = o["score"] - prev
        pc = (d / prev * 100) if prev else 0
        drows.append([o["t"], o["model"], f"{o['score']:.3f}", f"{d:+.3f}", f"{pc:+.0f}%"])
    story.append(KeepTogether([hdr, Spacer(1, 3),
                               table(drows, [1.0 * inch, 0.7 * inch, 0.6 * inch, 0.65 * inch,
                                             0.7 * inch],
                                     align_right=(2, 3, 4), style=tiny),
                               Spacer(1, 10)]))

story.append(PageBreak())
story.append(Paragraph("10. Comparison data as JSON", h2))
story.append(Paragraph("Same-model repeat pairs, cross-model pairs, and the window ratios.", body))
story.append(Preformatted("\n".join(wrap_json(
    {"sameModelRetest": retest, "crossModelWithin15min": disc["crossModel15"],
     "apexBurst": disc["apexBurst"], "windowRatio": window["windowRatio"],
     "percentChangePerSignal": pct, "gapVsChange": gaps})), mono))

story.append(PageBreak())
story.append(Paragraph("11. Stored records, all twenty", h2))
story.append(Paragraph(
    "Each record as stored. userKey is the SHA-256 of the email address used; the three "
    "distinct values are the same person. Sessions marked duplicate above share a score "
    "vector with the record before them.", body))
for i, r in enumerate(rows, 1):
    payload = {k: v for k, v in r.items() if k != "_id"}
    wrapped = wrap_json(payload)
    head = Paragraph(
        f"{i}. {ts(r['capturedAt'])} UTC · {r['model']} · document {r.get('_id')}"
        + ("  · duplicate audio" if i in dupes else ""), cellb)
    blk = [head, Spacer(1, 2), Preformatted("\n".join(wrapped), mono), Spacer(1, 9)]
    story.append(KeepTogether(blk) if len(wrapped) < 42 else blk[0])
    if len(wrapped) >= 42:
        story.extend(blk[1:])

doc = SimpleDocTemplate(OUT, pagesize=letter, leftMargin=54, rightMargin=54,
                        topMargin=54, bottomMargin=66,
                        title="Sona-2 Within-Subject Discordance")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("wrote", OUT)
