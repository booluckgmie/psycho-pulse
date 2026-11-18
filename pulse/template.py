"""Writes the blank upload template (CSV + Excel with a Guide sheet)."""
import pandas as pd

COLUMNS = ["student_id", "class", "week", "score", "attendance_pct",
           "late_submissions", "teacher_change", "school_event", "counsellor_followup"]
EXAMPLE = [["S001", "5A", 1, 7.5, 96, 0, 0, "", "No"],
           ["S001", "5A", 2, 7.0, 94, 1, 0, "", "No"]]
GUIDE = [
    ("student_id", "Anonymous ID (S001). Never names or MyKad.", "required"),
    ("class", "Class label, e.g. 5A.", "required"),
    ("week", "Screening week number (1, 2, 3...). One row per student per week.", "required"),
    ("score", "Pulse score 1-10 (higher = better wellbeing/engagement).", "required"),
    ("attendance_pct", "Attendance % for that week (0-100).", "required"),
    ("late_submissions", "Count of late work that week.", "required"),
    ("teacher_change", "1 if a teacher transfer affected the class that week, else 0.", "optional"),
    ("school_event", "Exam week / holiday / disruption, free text.", "optional"),
    ("counsellor_followup", "Yes/No - was support given?", "optional"),
]

if __name__ == "__main__":
    df = pd.DataFrame(EXAMPLE, columns=COLUMNS)
    df.iloc[0:0].to_csv("data/school_upload_template.csv", index=False)
    with pd.ExcelWriter("data/school_upload_template.xlsx") as xw:
        df.iloc[0:0].to_excel(xw, sheet_name="Upload", index=False)
        pd.DataFrame(EXAMPLE, columns=COLUMNS).to_excel(xw, sheet_name="Example", index=False)
        pd.DataFrame(GUIDE, columns=["column", "meaning", "required"]).to_excel(xw, sheet_name="Guide", index=False)
    print("templates written")
