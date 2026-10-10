"""Check a real-browser print of the Reports page, from the PDF alone.

    python tools/print-proof/check_pdf.py NAME        (reads out/NAME.pdf)

For every report chart: DRAWN only if it has bars AND real axis text; bars without
text are a STALE IMAGE (a frame printed mid-animation); neither is BLANK. Also the
plotting-area width (from the bars: n equal columns), x-label angles and how many
label lines sit under the axis. For every Key Insights card: drawn chart pixels.
Needs pypdfium2 and Pillow."""
import json, math, re, statistics, sys
import pypdfium2 as pdfium, pypdfium2.raw as raw

import os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", sys.argv[1])
px = lambda v: v / 72 * 96
alnum = lambda s: re.sub(r"[^0-9A-Za-z]", "", s)
resp = json.load(open(os.path.join(HERE, "fixtures", "responses.json"), encoding="utf-8"))
answers = {q["id"]: q["answer"] for q in resp["reports"]["questions|all"]}
TITLES = {"top_resort": "Top Tourist Destination", "month_compare": "Month-over-Month Arrivals", "peak_month": "Peak Season Analysis",
          "classification": "Visitor Demographics", "stay_type": "Same Day vs. Overnight Stays", "overnight_resort": "Top Destination for Overnight Stays",
          "average_stay": "Average Length of Stay", "top_origin": "Top Visitor Origins", "visit_purpose": "Primary Purpose of Travel",
          "high_demand": "Destinations with Growing Demand", "validation": "Data Quality & Validation"}
SUBTITLES = {"Daily": "Dailyvisitortotals", "Monthly": "Monthlyvisitortotals", "Yearly": "Yearlyvisitortotals", "Resort": "Visitortotalsbyresort",
             "Origin": "Visitortotalsgroupedbyprovince", "Purpose": "Visitortotalsgroupedbydeclared", "Vehicle": "Visitortotalsgroupedbyvehicle",
             "Boat": "Visitortotalsbyboattype", "No-show": "Noshowbookingsgrouped"}
saturated = lambda p: max(p[:3]) - min(p[:3]) > 60 and min(p[:3]) < 235
gridish = lambda p: max(p[:3]) - min(p[:3]) < 14 and 200 <= min(p[:3]) <= 248

pdf = pdfium.PdfDocument(OUT + ".pdf")
w, h = pdf[0].get_size()
print(f"{sys.argv[1]}: {len(pdf)} pages, {w / 72 * 25.4:.1f} x {h / 72 * 25.4:.1f} mm")
reports, cards = [], []
for i in range(len(pdf)):
    page = pdf[i]; tp = page.get_textpage(); t = tp.get_text_range(); H = page.get_size()[1]
    idx = [k for k in range(min(len(t), tp.count_chars())) if t[k].isalnum()]; s = "".join(t[k] for k in idx)
    img = None
    def raster():
        global img
        if img is None:
            img = page.render(scale=96 / 72).to_pil().convert("RGB")
        return img
    for name, sub in SUBTITLES.items():
        k0 = s.find(sub)
        if k0 < 0:
            continue
        k1 = s.find("TableDataBreakdown", k0)
        y0 = px(H - tp.get_charbox(idx[k0])[1]); y1 = px(H - tp.get_charbox(idx[k1])[3])
        im = raster(); p = im.load(); W = im.size[0]
        band = range(int(y0) + 4, int(y1) - 30)
        bars = sum(saturated(p[x, y]) for y in band for x in range(0, W, 2)) * 2
        # Plotting area from the bars: n equal columns, bars centred in them, so
        # (span of the bars - one bar width) = plot width x (1 - 1/n).
        cols = [x for x in range(W) if any(saturated(p[x, y]) for y in band)]
        groups = []
        for x in cols:
            if groups and x - groups[-1][1] <= 1:
                groups[-1][1] = x
            else:
                groups.append([x, x])
        groups = [g for g in groups if g[1] - g[0] >= 4]
        if len(groups) >= 2:
            span = groups[-1][1] - groups[0][0] + 1; bar_w = groups[0][1] - groups[0][0] + 1; n = len(groups)
            best = round((span - bar_w) / (1 - 1 / n))
        else:
            best = None
        angles, tops = set(), set()
        for k in range(min(len(t), tp.count_chars())):
            if t[k].isalpha():
                gy = px(H - tp.get_charbox(k)[3])
                if y0 + 4 < gy < y1 - 30:
                    m = raw.FS_MATRIX(); raw.FPDFText_GetMatrix(tp, k, m)
                    angles.add(round(math.degrees(math.atan2(m.b, m.a)), 1)); tops.add(round(gy))
        lines = []
        for y in sorted(tops):
            if not lines or y - lines[-1] > 8:
                lines.append(y)
        digits = sum(1 for k in range(min(len(t), tp.count_chars())) if t[k].isdigit() and y0 + 4 < px(H - tp.get_charbox(k)[3]) < y1 - 30)
        reports.append((name, i + 1, bars if digits else -bars, best, sorted(angles), len(lines)))
    for qid, title in TITLES.items():
        k0 = s.find(alnum(title))
        if k0 < 0:
            continue
        a = s.find(alnum(answers[qid])[:18], k0)
        y0 = px(H - tp.get_charbox(idx[k0 + len(alnum(title)) - 1])[1]); y1 = px(H - tp.get_charbox(idx[a])[3]) if a >= 0 else y0 + 300
        x0 = px(tp.get_charbox(idx[k0])[0])
        im = raster(); p = im.load()
        drawn = sum(saturated(p[x, y]) for y in range(int(y0) + 2, int(y1) - 12) for x in range(int(x0), int(x0) + 280, 2)) * 2
        cards.append((title, i + 1, drawn))
for name, pg, bars, plot, angles, lines in reports:
    state = "DRAWN" if bars > 2000 else ("STALE IMAGE (bars, no axis text)" if bars < -2000 else "BLANK")
    print(f"  {name:8} page {pg:<3} bars {state} ({abs(bars)} px) | plotting area {plot}px (from {'' if plot is None else 'bars'}) | label angles {angles} | label lines under the axis {lines}")
for title, pg, drawn in cards:
    print(f"  KI {title[:34]:34} page {pg:<3} {'DRAWN' if drawn > 400 else 'BLANK'} ({drawn} px)")
print(f"  SUMMARY: {len(pdf)} pages | report charts {sum(b > 2000 for _, _, b, _, _, _ in reports)}/{len(reports)} drawn | Key Insights {sum(d > 400 for _, _, d in cards)}/{len(cards)} drawn")
