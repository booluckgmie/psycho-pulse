"""Writes the downloadable upload templates into web/templates/.

  psychometric-pulse-template.xlsx   recommended: one row per student, Week 1..12 columns,
                                     optional Attendance / Late work sheets, worked example, read-me
  psychometric-pulse-template.csv    same layout, scores only (header row)
  psychometric-pulse-advanced.xlsx   long layout: one row per student per week (+ events, follow-up)
  psychometric-pulse-advanced.csv

The dashboard reads all of them (web/detect.js normalizeSheets, web/xlsx.js)."""
import csv
import pathlib

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

OUT = pathlib.Path(__file__).resolve().parents[1] / "web" / "templates"
WEEKS, ROWS = 12, 60
TEAL, INDIGO, INK, SOFT = "0FB5A7", "4B5FE8", "16202E", "F4F7FB"
HEAD = ["Student ID", "Class"] + [f"Week {i}" for i in range(1, WEEKS + 1)]
EXAMPLE = [  # a worked example (also used by the dashboard's "Load example")
    ("S01", "5A", [7.5, 7.2, 6.8, 6.1, 5.4]), ("S02", "5A", [7.0, 7.1, 7.0, 7.3, 7.1]),
    ("S03", "5A", [6.8, 6.9, 6.6, 6.8, 6.7]), ("S04", "5A", [7.4, 7.2, 7.5, 7.3, 7.4]),
    ("S05", "5A", [7.9, 7.7, 7.8, 8.0, 7.7]), ("S06", "5A", [7.1, 7.0, 7.2, 6.9, 7.0]),
    ("S07", "5A", [6.9, 6.5, 6.0, 5.4, 4.9]), ("S08", "5A", [7.5, 7.4, 7.6, 7.5, 7.3]),
]
READ_ME = [
    ("Psychometric-Pulse: how to fill in this template", True),
    ("", False),
    ("1. Scores sheet (required)", True),
    ("   One row per student. Type an anonymous Student ID (S01, S02...). Never use names or MyKad numbers.", False),
    ("   Class is optional (for example 5A). Enter each weekly pulse score from 1 to 10 under Week 1, Week 2, ...", False),
    ("   Higher means better wellbeing and engagement. Leave a cell empty if the student was absent or not measured.", False),
    ("   Starting at a different week? Edit the header, for example change Week 1 to Week 5, then Week 2 to Week 6.", False),
    ("", False),
    ("2. Attendance and Late work sheets (optional)", True),
    ("   Same layout as Scores. Attendance is a percentage (0 to 100). Late work is a count of late items that week.", False),
    ("   They are only used to separate Orange from Red alerts. Skip them if you do not have the data.", False),
    ("", False),
    ("3. Upload it", True),
    ("   Save the file, then upload the .xlsx (or a .csv export of the Scores sheet) on the dashboard. The Example", False),
    ("   and Read me sheets are ignored.", False),
    ("", False),
    ("How much data do you need?", True),
    ("   At least 3 scores per student; 5 or more is recommended, and 8 or more is reliable.", False),
    ("   Aim for 10 or more students in a class (6 is the minimum).", False),
    ("", False),
    ("Privacy", True),
    ("   The dashboard reads your file inside your browser. Nothing is uploaded or stored.", False),
    ("   Alerts are a prompt for a supportive conversation. They are never a diagnosis or a label.", False),
]
THIN = Side(style="thin", color="D5DCE8")


def _grid(ws, dv, example=None, title=None):
    ws.append(HEAD)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF", size=12)
        c.fill = PatternFill("solid", fgColor=TEAL if c.column > 2 else INDIGO)
        c.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 24
    ws.column_dimensions["A"].width = 16
    ws.column_dimensions["B"].width = 12
    for i in range(3, 3 + WEEKS):
        ws.column_dimensions[ws.cell(1, i).column_letter].width = 10
    n = len(example) if example else ROWS
    for r in range(2, 2 + n):
        for c in range(1, 3 + WEEKS):
            cell = ws.cell(r, c)
            cell.border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
            cell.fill = PatternFill("solid", fgColor=SOFT if c <= 2 else "FFFFFF")
            if c > 2:
                cell.alignment = Alignment(horizontal="center")
    if example:
        for r, (sid, cls, scores) in enumerate(example, start=2):
            ws.cell(r, 1, sid); ws.cell(r, 2, cls)
            for i, v in enumerate(scores):
                ws.cell(r, 3 + i, v)
    else:
        dv.add(f"C2:{ws.cell(1, 2 + WEEKS).column_letter}{1 + ROWS}")
        ws.add_data_validation(dv)
    ws.freeze_panes = "C2"
    ws["A1"].comment = Comment("Anonymous ID only: S01, S02... No names or MyKad.", "Psychometric-Pulse")
    ws["C1"].comment = Comment("Change the number if you start at a different week (e.g. Week 5).", "Psychometric-Pulse")


def _dv(kind):
    if kind == "score":
        dv = DataValidation(type="decimal", operator="between", formula1="1", formula2="10", allow_blank=True)
        dv.errorTitle, dv.error = "Score out of range", "Enter a pulse score from 1 to 10."
    elif kind == "attendance":
        dv = DataValidation(type="decimal", operator="between", formula1="0", formula2="100", allow_blank=True)
        dv.errorTitle, dv.error = "Attendance out of range", "Enter a percentage from 0 to 100."
    else:
        dv = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True)
        dv.errorTitle, dv.error = "Invalid number", "Enter the number of late items (0 or more)."
    dv.showErrorMessage = True
    return dv


def simple_xlsx():
    wb = Workbook()
    ws = wb.active; ws.title = "Read me"
    for i, (text, bold) in enumerate(READ_ME, start=1):
        c = ws.cell(i, 1, text)
        c.font = Font(bold=bold, size=15 if i == 1 else 12, color=INDIGO if bold else INK)
    ws.column_dimensions["A"].width = 118
    _grid(wb.create_sheet("Scores"), _dv("score"))
    _grid(wb.create_sheet("Attendance (optional)"), _dv("attendance"))
    _grid(wb.create_sheet("Late work (optional)"), _dv("late"))
    _grid(wb.create_sheet("Example"), None, example=EXAMPLE)
    wb.active = 1
    wb.save(OUT / "psychometric-pulse-template.xlsx")


ADV_COLS = ["student_id", "class", "week", "score", "attendance_pct", "late_submissions",
            "teacher_change", "school_event", "counsellor_followup"]
ADV_EXAMPLE = [["S001", "5A", 1, 7.5, 96, 0, 0, "", "No"], ["S001", "5A", 2, 7.0, 94, 1, 0, "", "No"]]
ADV_GUIDE = [
    ("student_id", "Anonymous ID (S001). Never names or MyKad.", "required"),
    ("class", "Class label, e.g. 5A.", "optional"),
    ("week", "Screening week number (1, 2, 3...). One row per student per week.", "required"),
    ("score", "Pulse score 1-10 (higher = better wellbeing/engagement).", "required"),
    ("attendance_pct", "Attendance % for that week (0-100).", "optional"),
    ("late_submissions", "Count of late work that week.", "optional"),
    ("teacher_change", "1 if a teacher transfer affected the class that week, else 0.", "optional"),
    ("school_event", "Exam week / holiday / disruption, free text.", "optional"),
    ("counsellor_followup", "Yes/No - was support given?", "optional"),
]


def advanced():
    with open(OUT / "psychometric-pulse-advanced.csv", "w", newline="") as f:
        csv.writer(f).writerow(ADV_COLS)
    wb = Workbook()
    ws = wb.active; ws.title = "Upload"; ws.append(ADV_COLS)
    ex = wb.create_sheet("Example"); ex.append(ADV_COLS)
    for r in ADV_EXAMPLE: ex.append(r)
    g = wb.create_sheet("Guide"); g.append(["column", "meaning", "required"])
    for r in ADV_GUIDE: g.append(r)
    for sh in (ws, ex, g):
        for c in sh[1]:
            c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor=INDIGO)
        for col in "ABCDEFGHI":
            sh.column_dimensions[col].width = 20
    g.column_dimensions["B"].width = 70
    wb.save(OUT / "psychometric-pulse-advanced.xlsx")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    simple_xlsx()
    with open(OUT / "psychometric-pulse-template.csv", "w", newline="") as f:
        csv.writer(f).writerow(HEAD)
    advanced()
    print("templates written to", OUT)


if __name__ == "__main__":
    main()
