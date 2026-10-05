"""
Builds the assessment and longitudinal report from the stored voiceSessions.

Working file. The finished PDF goes to the canonical Downloads folder.

Plain-document style per CLAUDE.md: Times New Roman throughout, black text
only, no eyebrow bar, no italic subtitle, title then a single rule then
straight into the first section.
"""

import json
import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
    KeepTogether, PageBreak, Preformatted,
)

SESSIONS = "/Users/amitmehta/Claude/ReSkinnable_B2C_Demo_Lovable/reports/sessions_flat.json"
LONGIT = "/Users/amitmehta/Claude/ReSkinnable_B2C_Demo_Lovable/reports/longit.json"
OUT = ("/Users/amitmehta/Library/CloudStorage/GoogleDrive-mehta@helix.harvard7.net/"
       "My Drive/Downloads/Sona2_Assessments_and_Longitudinal_Report.pdf")

BLACK = colors.HexColor("#000000")

body = ParagraphStyle("body", fontName="Times-Roman", fontSize=10.5, leading=14,
                      textColor=BLACK, spaceAfter=7)
title = ParagraphStyle("title", fontName="Times-Bold", fontSize=19, leading=23,
                       textColor=BLACK, spaceAfter=8)
h2 = ParagraphStyle("h2", fontName="Times-Bold", fontSize=13, leading=16,
                    textColor=BLACK, spaceBefore=16, spaceAfter=6)
h3 = ParagraphStyle("h3", fontName="Times-Bold", fontSize=11, leading=14,
                    textColor=BLACK, spaceBefore=10, spaceAfter=4)
cell = ParagraphStyle("cell", fontName="Times-Roman", fontSize=8.5, leading=11,
                      textColor=BLACK)
cellb = ParagraphStyle("cellb", fontName="Times-Bold", fontSize=8.5, leading=11,
                       textColor=BLACK)
mono = ParagraphStyle("mono", fontName="Courier", fontSize=6.4, leading=7.6,
                      textColor=BLACK)


def ts(ms):
    return datetime.datetime.fromtimestamp(int(ms) / 1000, datetime.UTC).strftime(
        "%Y-%m-%d %H:%M UTC")


def fmt(v, places=3, signed=False):
    if v is None:
        return "not established"
    spec = f"{{:+.{places}f}}" if signed else f"{{:.{places}f}}"
    return spec.format(v)


def table(rows, widths, align_right=()):
    data = []
    for ri, row in enumerate(rows):
        style = cellb if ri == 0 else cell
        data.append([Paragraph(str(c), style) for c in row])
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


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Times-Roman", 8)
    canvas.setFillColor(BLACK)
    canvas.drawRightString(letter[0] - 54, 30, str(doc.page))
    canvas.restoreState()


rows = json.load(open(SESSIONS))
longit = json.load(open(LONGIT))

by_user = {}
for r in rows:
    by_user.setdefault(r["userKey"], []).append(r)
for rs in by_user.values():
    rs.sort(key=lambda r: int(r.get("capturedAt") or 0))

# Largest history first; that is the only participant with enough sessions to
# support a baseline, so it carries the longitudinal section.
order = sorted(by_user.items(), key=lambda kv: -len(kv[1]))
alias = {k: f"Participant {chr(65 + i)}" for i, (k, _) in enumerate(order)}

story = []
story.append(Paragraph("Sona-2 Voice Assessments and Longitudinal Tracking", title))
story.append(HRFlowable(width="100%", thickness=1, color=BLACK,
                        spaceBefore=2, spaceAfter=12))

all_ts = [int(r["capturedAt"]) for r in rows]
story.append(Paragraph(
    f"This covers every assessment stored in the voiceSessions collection as of "
    f"{datetime.datetime.now(datetime.UTC).strftime('%d %B %Y')}: "
    f"{len(rows)} completed recordings from {len(by_user)} participants, captured between "
    f"{ts(min(all_ts))} and {ts(max(all_ts))}. Participants are identified in the "
    f"database only by a SHA-256 hash of their email address, so no name or address "
    f"appears in the stored record or below. Every score and level quoted is as the "
    f"API returned it. The longitudinal figures are produced by the same code the "
    f"product runs, not by a separate calculation.", body))

# ---------------------------------------------------------------- 01 sessions
story.append(Paragraph("1. Assessments completed", h2))

summary_rows = [["Participant", "Sessions", "Assessments used", "First", "Last"]]
for k, rs in order:
    paths = sorted({r["pathway"] for r in rs})
    summary_rows.append([
        alias[k], str(len(rs)), ", ".join(paths),
        ts(rs[0]["capturedAt"]).split(" ")[0], ts(rs[-1]["capturedAt"]).split(" ")[0],
    ])
story.append(table(summary_rows, [1.05 * inch, 0.6 * inch, 2.5 * inch, 0.85 * inch, 0.85 * inch],
                   align_right=(1,)))
story.append(Spacer(1, 10))

for k, rs in order:
    story.append(Paragraph(f"{alias[k]} — {len(rs)} sessions", h3))
    srows = [["Captured", "Assessment", "Model", "Overall", "Action", "Flagged"]]
    for r in rs:
        s = r.get("summary") or {}
        srows.append([
            ts(r["capturedAt"]), r["pathway"], r.get("model") or "—",
            s.get("overallLevel") or "—", s.get("recommendedAction") or "—",
            f"{s.get('flaggedCount')} / {s.get('totalSignals')}",
        ])
    story.append(table(srows, [1.45 * inch, 1.2 * inch, 0.6 * inch, 0.85 * inch,
                               0.85 * inch, 0.65 * inch], align_right=(5,)))
    story.append(Spacer(1, 8))

story.append(Paragraph(
    "Every session returned an overall level of MODERATE. That is the level the API "
    "reported on all twenty recordings, across four different models, so it is not a "
    "property of any one assessment. Recommended action varied between review and "
    "consider, which is the field that actually separated these results.", body))

# ----------------------------------------------------------- 02 longitudinal
story.append(Paragraph("2. Longitudinal tracking", h2))
story.append(Paragraph(
    "A baseline is the exponentially weighted mean of every reading before the most "
    "recent one, so it describes where a participant has been rather than including "
    "the reading it is being compared against. It needs three sessions to form. "
    "Deviation is the latest reading minus that baseline. Direction is reported only "
    "when the deviation exceeds the participant's own spread, so a move smaller than "
    "someone's usual variation reads flat rather than as a trend.", body))
story.append(Paragraph(
    "Readings within thirty minutes of each other collapse into one, because repeated "
    "takes in a single sitting describe one moment and would otherwise weight it "
    "several times over.", body))

for k, rs in order:
    v = longit.get(k)
    if not v:
        continue
    story.append(Paragraph(f"{alias[k]}", h3))
    lrows = [["Signal", "Readings", "Latest", "Baseline", "Deviation", "Spread", "Direction"]]
    signs = sorted(v["signs"].items(),
                   key=lambda kv: (kv[1]["baseline"] is None, -abs(kv[1]["deviation"] or 0)))
    for name, s in signs:
        lrows.append([
            s["label"],
            f"{s['rawReadings']} → {s['afterBurstCollapse']}",
            fmt(s["latest"]),
            fmt(s["baseline"]),
            fmt(s["deviation"], signed=True),
            fmt(s["spread"]),
            (s["direction"] or "—"),
        ])
    story.append(table(lrows, [1.5 * inch, 0.75 * inch, 0.65 * inch, 0.8 * inch,
                               0.8 * inch, 0.65 * inch, 0.7 * inch],
                       align_right=(2, 3, 4, 5)))
    story.append(Spacer(1, 8))

# ------------------------------------------------------------- 03 assessment
story.append(Paragraph("3. Assessment of the longitudinal results", h2))

pa_key = order[0][0]
pa = longit[pa_key]["signs"]


def sign(nm):
    return next((s for s in pa.values() if s["label"] == nm), None)


anx, strs, mood = sign("Anxiety"), sign("Stress"), sign("Mood Disruption")

story.append(Paragraph("Only one participant has enough history to read", h3))
story.append(Paragraph(
    f"{alias[pa_key]} is the only participant past the three-session threshold, with "
    f"fifteen sessions over three days. The other two recorded three and two sessions, "
    f"and in both cases every session fell inside a single thirty-minute window, so "
    f"burst collapsing reduces them to one effective reading each. They have current "
    f"readings and no trend, which is the correct output rather than a gap: two takes "
    f"three minutes apart do not describe a direction of travel.", body))

story.append(Paragraph("Two signals are genuinely moving", h3))
story.append(Paragraph(
    f"Anxiety and Stress are the only two signals whose movement clears the "
    f"participant's own variation. Anxiety sits at {fmt(anx['latest'])} against a "
    f"baseline of {fmt(anx['baseline'])}, a deviation of {fmt(anx['deviation'], signed=True)} "
    f"against a spread of {fmt(anx['spread'])}. Stress sits at {fmt(strs['latest'])} "
    f"against {fmt(strs['baseline'])}, a deviation of {fmt(strs['deviation'], signed=True)} "
    f"against a spread of {fmt(strs['spread'])}. Both are reported rising, and both are "
    f"roughly double their baseline. They are also the two signals with the most "
    f"readings behind them, nine each after collapsing, so these are the best supported "
    f"trends in the set.", body))

story.append(Paragraph("One signal moved as much and is correctly not called a trend", h3))
story.append(Paragraph(
    f"Mood Disruption deviates {fmt(mood['deviation'], signed=True)} from its baseline of "
    f"{fmt(mood['baseline'])}, which is close to what Stress did. It reads flat, because "
    f"its spread is {fmt(mood['spread'])} and the move sits inside that. This "
    f"participant's Mood Disruption readings swing widely from session to session, so a "
    f"move of that size is ordinary for them. This is the part of the design worth "
    f"noting: the same absolute change is a trend on one signal and noise on another, "
    f"depending on the person's own history rather than on a fixed threshold.", body))

story.append(Paragraph("What the level field does not show", h3))
story.append(Paragraph(
    "All twenty sessions reported MODERATE, so the overall level distinguished nothing "
    "across three days and four models. The per-signal scores did: within those "
    "identical MODERATE results, Anxiety moved from around 0.32 to 0.62 and Stress from "
    "0.18 to 0.43. Anything tracking change over time has to read the signal scores, "
    "because the overall level is flat across this entire set.", body))

story.append(Paragraph("Coverage is uneven because the models differ", h3))
story.append(Paragraph(
    "Signals appear only in the sessions whose model measures them, so reading counts "
    "vary widely within one participant: Fatigue has fifteen readings, Head Impact four, "
    "Metabolic Load two. Five of this participant's fourteen signals have no baseline at "
    "all for that reason. Mixing assessments gives broader coverage per session and "
    "thinner history per signal, and the signals with the shortest history are the ones "
    "least able to support a trend.", body))

story.append(Paragraph("A caution on what these numbers are", h3))
story.append(Paragraph(
    "These twenty sessions include development and testing recordings, several taken "
    "seconds apart to exercise the pipeline. The trends above are arithmetically correct "
    "on the data stored, and the two rising signals are well supported within it, but "
    "this is not a clean cohort and the movement may reflect how the recordings were "
    "made rather than anything about the speakers.", body))

# ------------------------------------------------------------------ 04 JSON
story.append(PageBreak())
story.append(Paragraph("4. Stored JSON, every session", h2))
story.append(Paragraph(
    "Each record exactly as it sits in Firestore, oldest first per participant. "
    "userKey is the SHA-256 of the participant's email; the plaintext address is never "
    "stored. Document ids are included so any record here can be traced back.", body))

for k, rs in order:
    story.append(Paragraph(f"{alias[k]} ({len(rs)} records)", h3))
    for r in rs:
        doc_id = r.get("_id")
        payload = {kk: vv for kk, vv in r.items() if kk != "_id"}
        text = json.dumps(payload, indent=1, sort_keys=True)
        wrapped = []
        for line in text.split("\n"):
            while len(line) > 118:
                wrapped.append(line[:118])
                line = "  " + line[118:]
            wrapped.append(line)
        block = [
            Paragraph(f"{ts(r['capturedAt'])} · {r['pathway']} · document {doc_id}", cellb),
            Spacer(1, 2),
            Preformatted("\n".join(wrapped), mono),
            Spacer(1, 9),
        ]
        story.append(KeepTogether(block) if len(wrapped) < 42 else block[0])
        if len(wrapped) >= 42:
            story.extend(block[1:])

# ---------------------------------------------------------------- 05 appendix
story.append(Paragraph("5. Longitudinal figures as JSON", h2))
story.append(Paragraph(
    "The computed output for every signal, including the drift and short-term slope "
    "figures the chart uses.", body))
text = json.dumps(
    {alias[k]: longit[k] for k, _ in order if k in longit}, indent=1, sort_keys=True)
wrapped = []
for line in text.split("\n"):
    while len(line) > 118:
        wrapped.append(line[:118])
        line = "  " + line[118:]
    wrapped.append(line)
story.append(Preformatted("\n".join(wrapped), mono))

doc = SimpleDocTemplate(OUT, pagesize=letter,
                        leftMargin=54, rightMargin=54, topMargin=54, bottomMargin=48,
                        title="Sona-2 Assessments and Longitudinal Tracking")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("wrote", OUT)
