"""
Builds the score-level reliability report from the stored voiceSessions.

Working file. The finished PDF goes to the canonical Downloads folder.

Focus is the scores themselves and how they move. The summary fields the API
returns alongside them (overall level, recommended action, flagged counts) are
deliberately absent: they were identical on all twenty recordings and so carry
no information about how the scores behave.

Plain-document style per CLAUDE.md: Times New Roman, black only, no eyebrow
bar, no italic subtitle.
"""

import json
import datetime
import statistics as st
import itertools
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
       "My Drive/Downloads/Sona2_Score_Reliability_Report.pdf")

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
mono = ParagraphStyle("mono", fontName="Courier", fontSize=6.4, leading=7.6, textColor=BLACK)


def ts(ms):
    return datetime.datetime.fromtimestamp(int(ms) / 1000, datetime.UTC).strftime("%Y-%m-%d %H:%M")


def f3(v, signed=False):
    if v is None:
        return "n/a"
    return (f"{v:+.3f}" if signed else f"{v:.3f}")


def table(rows, widths, align_right=()):
    data = [[Paragraph(str(c), cellb if ri == 0 else cell) for c in row]
            for ri, row in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1)
    cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, BLACK),
        ("LINEBELOW", (0, 1), (-1, -2), 0.25, colors.HexColor("#BBBBBB")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
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
rel = json.load(open(f"{BASE}/reliability.json"))
cm = json.load(open(f"{BASE}/crossmodel.json"))
longit = json.load(open(f"{BASE}/longit.json"))

by_user = {}
for r in rows:
    by_user.setdefault(r["userKey"], []).append(r)
for rs in by_user.values():
    rs.sort(key=lambda r: r["capturedAt"])
order_users = sorted(by_user.items(), key=lambda kv: -len(kv[1]))
alias = {k: f"Participant {chr(65 + i)}" for i, (k, _) in enumerate(order_users)}
main = rel["mainUser"]
signals = rel["signals"]

story = []
story.append(Paragraph("Sona-2 Score Reliability: Repeat Measures and Longitudinal Change", title))
story.append(HRFlowable(width="100%", thickness=1, color=BLACK, spaceBefore=2, spaceAfter=12))

all_ts = [r["capturedAt"] for r in rows]
story.append(Paragraph(
    f"Twenty completed recordings from three participants, captured between "
    f"{ts(min(all_ts))} and {ts(max(all_ts))} UTC, taken from the voiceSessions "
    f"collection. This looks only at the numeric scores the models return and how "
    f"those scores move. The summary fields returned alongside them are not used: "
    f"overall level read MODERATE on all twenty recordings across four models, and so "
    f"separates nothing. Participants are identified only by a SHA-256 hash of their "
    f"email address.", body))
story.append(Paragraph(
    "The question here is not whether a score is clinically right, which this data "
    "cannot answer. It is narrower and answerable: when the same voice is measured "
    "twice, does the same number come back. Three comparisons in this data bear on "
    "that, and they are set out in sections 2, 3 and 4.", body))

# ------------------------------------------------------------------ recordings
story.append(Paragraph("1. Recordings", h2))
srows = [["Participant", "Sessions", "Models used", "Window"]]
for k, rs in order_users:
    srows.append([alias[k], str(len(rs)), ", ".join(sorted({r["model"] for r in rs})),
                  f"{ts(rs[0]['capturedAt'])} to {ts(rs[-1]['capturedAt'])}"])
story.append(table(srows, [1.0 * inch, 0.65 * inch, 1.7 * inch, 2.5 * inch], align_right=(1,)))

# -------------------------------------------------- 2. cross-model disagreement
story.append(Paragraph("2. Two models, one voice, minutes apart", h2))
s10 = cm["summary"].get("<= 10 min", {})
s90 = cm["summary"].get("<= 90 min", {})
story.append(Paragraph(
    f"Four signals are measured by more than one model: Fatigue, Anxiety, Stress and "
    f"Dehydration. Where a participant recorded on two different models close together, "
    f"the same underlying state is being measured twice within minutes, and the two "
    f"numbers can be compared directly.", body))
story.append(Paragraph(
    f"Across {int(s10.get('n', 0))} such comparisons taken ten minutes apart or less, the "
    f"mean absolute difference is {f3(s10.get('mean'))} on a 0 to 1 scale, the largest is "
    f"{f3(s10.get('max'))}, and the two models placed the reading in different bands in "
    f"{int(s10.get('bandDiff', 0))} of {int(s10.get('n', 0))} cases "
    f"({s10.get('pct', 0):.0f} per cent). Widening the window to ninety minutes gives "
    f"{int(s90.get('n', 0))} comparisons, a mean absolute difference of {f3(s90.get('mean'))}, "
    f"and band disagreement in {s90.get('pct', 0):.0f} per cent.", body))

tight = sorted([p for p in cm["pairs"] if p["gap"] <= 10], key=lambda x: -x["diff"])
prows = [["Signal", "Model A", "Score A", "Model B", "Score B", "Difference", "Apart"]]
for p in tight[:10]:
    prows.append([p["sign"], p["ma"], f"{p['a']:.3f} ({p['la']})", p["mb"],
                  f"{p['b']:.3f} ({p['lb']})", f3(p["diff"]),
                  f"{p['gap']:.0f} min"])
story.append(Spacer(1, 4))
story.append(table(prows, [1.0 * inch, 0.6 * inch, 1.15 * inch, 0.6 * inch, 1.15 * inch,
                           0.75 * inch, 0.6 * inch], align_right=(5, 6)))
story.append(Spacer(1, 6))
story.append(Paragraph(
    "The top row is the clearest single case. Five minutes apart, pulse put Fatigue at "
    "0.430 and apex put it at 0.121. One reads as moderate, the other as consider. "
    "Nothing about the speaker changed in five minutes.", body))

bysign = {}
for p in cm["pairs"]:
    bysign.setdefault(p["sign"], []).append(p)
brows = [["Signal", "Comparisons", "Mean difference", "Largest", "Band disagreed"]]
for s, xs in sorted(bysign.items(), key=lambda kv: -st.mean(x["diff"] for x in kv[1])):
    bd = sum(1 for x in xs if x["bandDiff"])
    brows.append([s, str(len(xs)), f3(st.mean(x["diff"] for x in xs)),
                  f3(max(x["diff"] for x in xs)), f"{bd} of {len(xs)}"])
story.append(table(brows, [1.4 * inch, 1.0 * inch, 1.2 * inch, 0.8 * inch, 1.2 * inch],
                   align_right=(1, 2, 3, 4)))
story.append(Spacer(1, 5))
story.append(Paragraph(
    "Fatigue is the worst of the four and also the most measured: nine of its fourteen "
    "cross-model comparisons put the reading in a different band.", body))

# --------------------------------------------------------- 3. repeat takes
story.append(Paragraph("3. The same model, twice, on the same person", h2))
story.append(Paragraph(
    "Participant B recorded three times on apex inside 161 seconds. The first two takes "
    "returned byte-identical scores on all six signals, which means the same audio was "
    "submitted twice: the model is deterministic, so identical input gives identical "
    "output. That matters, because it establishes that none of the variation elsewhere "
    "in this report comes from the model being stochastic. Every difference is driven by "
    "the audio.", body))
story.append(Paragraph(
    "The third take is a genuinely separate recording, and it is the only true repeat "
    "measure in the whole set.", body))
rrows = [["Signal", "Takes 1 and 2", "Take 3", "Change", "Band moved"]]
retest = [("Cognitive Load", 0.260, 0.076, "moderate to low", True),
          ("Stress", 0.342, 0.227, "moderate to consider", True),
          ("Anxiety", 0.869, 0.753, "no", False),
          ("Dehydration", 0.337, 0.399, "no", False),
          ("Cardiovascular Strain", 0.374, 0.428, "no", False),
          ("Fatigue", 0.440, 0.447, "no", False)]
for nm, a, b, moved, flag in retest:
    rrows.append([nm, f"{a:.3f}", f"{b:.3f}", f"{b - a:+.3f}", moved])
story.append(table(rrows, [1.5 * inch, 1.0 * inch, 0.8 * inch, 0.8 * inch, 1.6 * inch],
                   align_right=(1, 2, 3)))
story.append(Spacer(1, 6))
story.append(Paragraph(
    "Two of six signals changed band across two and a half minutes. Cognitive Load fell "
    "from 0.260 to 0.076, losing seventy per cent of its value. On a single repeat "
    "measure that is one observation rather than a rate, but it is the only repeat "
    "measure available and it moved two signals across a boundary.", body))

# ------------------------------------------------- 4. within-person dispersion
story.append(Paragraph("4. One person's range against the width of a band", h2))
story.append(Paragraph(
    f"{alias[main]} recorded fifteen times over three days. For each signal below, the "
    f"range is that participant's own spread of scores, and the band width is the average "
    f"width of a level for that signal measured across all twenty recordings. Where the "
    f"range is several times the band width, the participant's ordinary session-to-session "
    f"variation is wider than the bands the result is reported in.", body))
drows = [["Signal", "Readings", "Lowest", "Highest", "Range", "SD", "Band width", "Bands hit"]]
for n, v in sorted(signals.items(), key=lambda kv: -(kv[1]["range"])):
    if v["n"] < 3:
        continue
    drows.append([v["label"], str(v["n"]), f3(v["min"]), f3(v["max"]), f3(v["range"]),
                  f3(v["sd"]), f3(v["meanBandWidth"]), str(len(v["bandsSeen"]))])
story.append(table(drows, [1.35 * inch, 0.65 * inch, 0.6 * inch, 0.62 * inch, 0.6 * inch,
                           0.55 * inch, 0.75 * inch, 0.6 * inch],
                   align_right=(1, 2, 3, 4, 5, 6, 7)))
story.append(Spacer(1, 6))
story.append(Paragraph(
    "Blood Pressure and Cardiovascular Strain each covered all four bands in one "
    "participant over three days, from none through to moderate. Mood Disruption has a "
    "standard deviation of 0.253 against a mean band width of 0.060, so its noise is "
    "roughly four times the width of a band. For those three, which band the result "
    "lands in is decided more by which recording was taken than by anything stable "
    "about the speaker.", body))

# ----------------------------------------------------------- 5. longitudinal
story.append(Paragraph("5. Longitudinal change", h2))
story.append(Paragraph(
    "A baseline is the exponentially weighted mean of every reading before the latest "
    "one, so it describes where the participant has been. Deviation is the latest reading "
    "minus that baseline. Direction is reported only when the deviation exceeds that "
    "participant's own spread, which is what keeps sections 2 to 4 from turning into "
    "false trends.", body))
v = longit.get(main, {})
lrows = [["Signal", "Readings", "Latest", "Baseline", "Deviation", "Spread", "Direction"]]
for name, s in sorted(v.get("signs", {}).items(),
                      key=lambda kv: (kv[1]["baseline"] is None, -abs(kv[1]["deviation"] or 0))):
    lrows.append([s["label"], f"{s['rawReadings']} to {s['afterBurstCollapse']}",
                  f3(s["latest"]), f3(s["baseline"]), f3(s["deviation"], signed=True),
                  f3(s["spread"]), s["direction"] or "not established"])
story.append(table(lrows, [1.45 * inch, 0.8 * inch, 0.62 * inch, 0.75 * inch, 0.75 * inch,
                           0.62 * inch, 1.0 * inch], align_right=(2, 3, 4, 5)))
story.append(Spacer(1, 6))
story.append(Paragraph(
    "Two signals clear the bar. Anxiety sits at 0.616 against a baseline of 0.319, and "
    "Stress at 0.426 against 0.181, both roughly double, and both with nine readings "
    "behind them. Mood Disruption moved almost as far, by 0.239, and is correctly not "
    "called a trend: its spread is 0.250, so the move sits inside the participant's own "
    "noise. Read against sections 2 to 4, the two rising signals are the ones where a "
    "move survived a measurement whose repeat error is itself around 0.15.", body))

# --------------------------------------------------------------- 6. what holds
story.append(Paragraph("6. What this data does and does not support", h2))
story.append(Paragraph("Supported", h3))
story.append(Paragraph(
    f"Two models measuring one voice minutes apart disagree by {f3(s10.get('mean'))} on "
    f"average and place the reading in different bands about a third of the time. One "
    f"repeat recording on a single model moved two of six signals across a band boundary "
    f"in under three minutes. And one participant's own range covers all four bands on "
    f"two signals. Together those say the score is not reproducible to the precision the "
    f"four-band output implies.", body))
story.append(Paragraph("Not supported", h3))
story.append(Paragraph(
    "This says nothing about whether the scores are clinically correct. There is no "
    "reference measurement here, no ground truth of any kind, so accuracy against a real "
    "state cannot be assessed from this data. It is a reliability finding, not a validity "
    "one.", body))
story.append(Paragraph(
    "One argument worth explicitly setting aside: pooling every signal together appears "
    "to show 135 cases of a higher score being graded into a lower level. That is an "
    "artifact of comparing across signals. Checked within each signal separately, the "
    "score to level mapping is monotonic in all fourteen, with no overlap at any "
    "boundary. The mapping is internally consistent and should not be presented as a "
    "defect.", body))
story.append(Paragraph("Caveat on provenance", h3))
story.append(Paragraph(
    "These twenty recordings are development and testing captures, several taken seconds "
    "apart to exercise the pipeline, on a small number of speakers. The arithmetic is "
    "correct on the stored data, and the cross-model comparison in section 2 is the "
    "strongest part of it because it is internally controlled: same speaker, same "
    "minutes, two models. A clean test-retest protocol on a real cohort would settle "
    "the question properly, and the numbers here are the argument for running one.", body))

# ------------------------------------------------------------------- JSON
story.append(PageBreak())
story.append(Paragraph("7. Cross-model comparisons, full data", h2))
story.append(Preformatted("\n".join(wrap_json(cm)), mono))

story.append(PageBreak())
story.append(Paragraph("8. Per-signal scores, every recording", h2))
story.append(Paragraph(
    "Every score returned for the participant with the longest history, per signal, "
    "in capture order with the model that produced it.", body))
story.append(Preformatted("\n".join(wrap_json(
    {v["label"]: {"n": v["n"], "range": round(v["range"], 4), "sd": round(v["sd"], 4),
                  "bandsSeen": v["bandsSeen"],
                  "readings": [{"t": ts(o["t"]), "model": o["model"],
                                "score": round(o["score"], 4), "level": o["level"]}
                               for o in v["obs"]]}
     for v in signals.values()})), mono))

story.append(PageBreak())
story.append(Paragraph("9. Stored records, all sessions", h2))
story.append(Paragraph(
    "Each record as stored, with the summary fields left in place for completeness even "
    "though the analysis above does not use them. Signal scores and levels are the "
    "material.", body))
for k, rs in order_users:
    story.append(Paragraph(f"{alias[k]} ({len(rs)} records)", h3))
    for r in rs:
        payload = {kk: vv for kk, vv in r.items() if kk != "_id"}
        wrapped = wrap_json(payload)
        head = Paragraph(f"{ts(r['capturedAt'])} UTC · {r['model']} · document {r.get('_id')}", cellb)
        blk = [head, Spacer(1, 2), Preformatted("\n".join(wrapped), mono), Spacer(1, 9)]
        story.append(KeepTogether(blk) if len(wrapped) < 42 else blk[0])
        if len(wrapped) >= 42:
            story.extend(blk[1:])

doc = SimpleDocTemplate(OUT, pagesize=letter, leftMargin=54, rightMargin=54,
                        topMargin=54, bottomMargin=48,
                        title="Sona-2 Score Reliability")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("wrote", OUT)
