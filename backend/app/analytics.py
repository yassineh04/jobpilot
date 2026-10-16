from collections import Counter, defaultdict
from statistics import median
from typing import Optional

MIN_FUNNEL_SAMPLE = 10     # below this, the funnel is labelled "limited data"
MIN_STEP_SAMPLE = 3        # a step needs this many entries to be a bottleneck candidate
MIN_RESUME_SAMPLE = 10     # submitted applications needed per resume to compare
MIN_DIFF_POINTS = 10.0     # response-rate gap (percentage points) worth highlighting
MIN_REJECTION_SAMPLE = 5

NOT_SUBMITTED = {"SAVED", "PREPARING"}
RESPONSE_STATUSES = {"RECRUITER_CONTACT", "ASSESSMENT", "INTERVIEW", "FINAL_INTERVIEW", "OFFER"}
INTERVIEWED_STATUSES = {"INTERVIEW", "FINAL_INTERVIEW", "OFFER"}
FINAL_STATUSES = {"FINAL_INTERVIEW", "OFFER"}

DEFINITIONS = {
    "applied": "Applications that left Saved/Preparing (withdrawn ones only if an applied date exists).",
    "response": "Reached Recruiter Contact or beyond, or has at least one recorded interview. "
                "A rejection with no other recorded progress is not counted as a response.",
    "interview": "Reached Interview, Final Interview or Offer, or has a recorded interview.",
    "final": "Currently at Final Interview or Offer.",
    "offer": "Currently at Offer.",
}

OBSERVATIONAL_LABEL = (
    "Observational statistics based only on the applications you recorded. "
    "They do not show that one resume caused a better or worse result."
)


def pct(numerator: int, denominator: int) -> Optional[float]:
    return round(numerator / denominator * 100, 1) if denominator else None


def classify(status: str, has_interview: bool, applied_date) -> dict:
    submitted = status not in NOT_SUBMITTED and not (status == "WITHDRAWN" and applied_date is None)
    if not submitted:
        return {"submitted": False, "responded": False, "interviewed": False,
                "final": False, "offer": False}
    return {
        "submitted": True,
        "responded": status in RESPONSE_STATUSES or has_interview,
        "interviewed": status in INTERVIEWED_STATUSES or has_interview,
        "final": status in FINAL_STATUSES,
        "offer": status == "OFFER",
    }


def build_funnel(rows: list[dict]) -> dict:
    """rows: [{"status": str, "has_interview": bool, "applied_date": date | None}]"""
    flags = [classify(r["status"], r["has_interview"], r["applied_date"]) for r in rows]
    keys = ["submitted", "responded", "interviewed", "final", "offer"]
    labels = {"submitted": "Applied", "responded": "Response", "interviewed": "Interview",
              "final": "Final interview", "offer": "Offer"}
    counts = {k: sum(1 for f in flags if f[k]) for k in keys}

    stages = [{"key": k, "label": labels[k], "count": counts[k]} for k in keys]

    steps = []
    for current, nxt in zip(keys, keys[1:]):
        steps.append({
            "from_label": labels[current], "to_label": labels[nxt],
            "from_count": counts[current], "to_count": counts[nxt],
            "rate": pct(counts[nxt], counts[current]),
        })

    eligible = [s for s in steps if s["from_count"] >= MIN_STEP_SAMPLE and s["rate"] is not None]
    bottleneck = None
    if len(eligible) >= 2:
        lowest = min(eligible, key=lambda s: s["rate"])
        bottleneck = {
            **lowest,
            "message": (f"Of {lowest['from_count']} applications that reached "
                        f"“{lowest['from_label']}”, {lowest['to_count']} reached "
                        f"“{lowest['to_label']}” ({lowest['rate']}%). This is the lowest "
                        "step-to-step conversion in your recorded data."),
        }

    return {
        "stages": stages,
        "steps": steps,
        "bottleneck": bottleneck,
        "rejected_count": sum(1 for r in rows if r["status"] == "REJECTED"),
        "withdrawn_count": sum(1 for r in rows if r["status"] == "WITHDRAWN"),
        "limited_data": counts["submitted"] < MIN_FUNNEL_SAMPLE,
        "min_sample": MIN_FUNNEL_SAMPLE,
        "definitions": DEFINITIONS,
    }


def build_rejection_stats(reasons: list[Optional[str]]) -> dict:
    total = len(reasons)
    counter = Counter(r or "NOT_RECORDED" for r in reasons)
    return {
        "total_rejected": total,
        "items": [{"reason": reason, "count": count, "percent": pct(count, total)}
                  for reason, count in counter.most_common()],
        "limited_data": total < MIN_REJECTION_SAMPLE,
        "min_sample": MIN_REJECTION_SAMPLE,
    }


MIN_BREAKDOWN_SAMPLE = 3
MIN_TIMING_SAMPLE = 3


def build_breakdowns(rows: list[dict], keys: tuple[str, ...] = ("source", "location", "work_mode")) -> dict:
    """Observed response rate grouped by an attribute (e.g. job source). Submitted applications only."""
    result = {}
    for key in keys:
        groups: dict[str, dict] = defaultdict(lambda: {"applications": 0, "responses": 0})
        for r in rows:
            f = classify(r["status"], r["has_interview"], r["applied_date"])
            if not f["submitted"]:
                continue
            g = groups[r.get(key) or "Not recorded"]
            g["applications"] += 1
            g["responses"] += 1 if f["responded"] else 0
        result[key] = sorted(
            ({"label": label, **g, "response_rate": pct(g["responses"], g["applications"]),
              "limited_data": g["applications"] < MIN_BREAKDOWN_SAMPLE}
             for label, g in groups.items()),
            key=lambda x: -x["applications"])[:8]
    return result


def _days(a, b) -> float:
    return (b - a).total_seconds() / 86400


def build_timing(events_by_app: dict, applied_by_app: dict) -> dict:
    """
    events_by_app: {app_id: [(occurred_at, to_status), ...] sorted by time}
    applied_by_app: {app_id: applied datetime or None}
    Measures days from application to first response, to rejection, and time spent per stage.
    """
    first_response, to_rejection = [], []
    stage_durations: dict[str, list[float]] = defaultdict(list)
    for app_id, events in events_by_app.items():
        applied = applied_by_app.get(app_id)
        if applied is None:
            applied = next((t for t, s in events if s and s not in NOT_SUBMITTED), None)
        if applied:
            response = next((t for t, s in events if s in RESPONSE_STATUSES and t >= applied), None)
            if response:
                first_response.append(_days(applied, response))
            rejected = next((t for t, s in events if s == "REJECTED" and t >= applied), None)
            if rejected:
                to_rejection.append(_days(applied, rejected))
        status_changes = [(t, s) for t, s in events if s]
        for (start, status), (end, _next) in zip(status_changes, status_changes[1:]):
            if status not in NOT_SUBMITTED:
                stage_durations[status].append(_days(start, end))

    def summary(values):
        return {"n": len(values),
                "median_days": round(median(values), 1) if values else None,
                "average_days": round(sum(values) / len(values), 1) if values else None,
                "limited_data": len(values) < MIN_TIMING_SAMPLE}

    return {
        "first_response": summary(first_response),
        "to_rejection": summary(to_rejection),
        "time_in_stage": [{"status": s, **summary(v)} for s, v in stage_durations.items()],
    }


def build_resume_comparison(rows: list[dict], names: dict) -> dict:
    """rows: [{"resume_id", "status", "has_interview", "applied_date"}]; names: {resume_id: name}"""
    groups: dict = {}
    for r in rows:
        f = classify(r["status"], r["has_interview"], r["applied_date"])
        if not f["submitted"]:
            continue
        g = groups.setdefault(r["resume_id"], {"applications": 0, "responses": 0, "interviews": 0})
        g["applications"] += 1
        g["responses"] += 1 if f["responded"] else 0
        g["interviews"] += 1 if f["interviewed"] else 0

    resumes = []
    for resume_id, g in groups.items():
        resumes.append({
            "resume_id": str(resume_id) if resume_id else None,
            "name": names.get(resume_id, "Unknown resume") if resume_id else "No resume assigned",
            **g,
            "response_rate": pct(g["responses"], g["applications"]),
            "interview_rate": pct(g["interviews"], g["applications"]),
            "limited_data": g["applications"] < MIN_RESUME_SAMPLE,
        })
    resumes.sort(key=lambda x: -x["applications"])

    eligible = [r for r in resumes if r["resume_id"] and not r["limited_data"]]
    if len(eligible) < 2:
        message = (f"Not enough data to compare resumes yet. At least {MIN_RESUME_SAMPLE} submitted "
                   "applications per resume are needed before a difference is highlighted.")
    else:
        ranked = sorted(eligible, key=lambda r: r["response_rate"], reverse=True)
        top, bottom = ranked[0], ranked[-1]
        gap = round(top["response_rate"] - bottom["response_rate"], 1)
        if gap >= MIN_DIFF_POINTS:
            message = (f"“{top['name']}” has historically been associated with a higher observed "
                       f"response rate ({top['response_rate']}% vs {bottom['response_rate']}% for "
                       f"“{bottom['name']}”) in the applications you recorded.")
        else:
            message = ("No clear difference in observed response rate between your resumes "
                       f"(gap of {gap} points).")

    return {"resumes": resumes, "comparison": message, "label": OBSERVATIONAL_LABEL,
            "min_sample": MIN_RESUME_SAMPLE}