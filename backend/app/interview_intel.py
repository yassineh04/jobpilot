from collections import defaultdict
from datetime import date
from typing import Optional

MIN_OBSERVATIONS = 3        # below this, a topic is flagged "limited data"
MIN_TREND_OBSERVATIONS = 4  # minimum rated answers before computing a trend
TREND_THRESHOLD = 0.5       # average difference needed to call it a trend

LABEL = ("Self-reported confidence based on recorded interview experiences. "
         "This does not measure objective ability.")


def _avg(values: list[int]) -> Optional[float]:
    return round(sum(values) / len(values), 2) if values else None


def build_weakness_map(rows: list[dict]) -> dict:
    """
    rows: [{"topic": str, "confidence": int | None, "when": date}]
    Descriptive statistics only: question frequency, average self-reported confidence,
    and a first-half vs second-half trend. Never claims objective skill.
    """
    by_topic: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_topic[row["topic"]].append(row)

    topics = []
    for topic, items in by_topic.items():
        rated = sorted((i for i in items if i["confidence"] is not None),
                       key=lambda i: i["when"])
        confidences = [i["confidence"] for i in rated]

        first_avg = recent_avg = trend = None
        if len(rated) >= MIN_TREND_OBSERVATIONS:
            mid = len(rated) // 2
            first_avg = _avg(confidences[:mid])
            recent_avg = _avg(confidences[mid:])
            delta = recent_avg - first_avg
            if delta >= TREND_THRESHOLD:
                trend = "improving"
            elif delta <= -TREND_THRESHOLD:
                trend = "declining"
            else:
                trend = "stable"

        topics.append({
            "topic": topic,
            "question_count": len(items),
            "rated_count": len(rated),
            "average_confidence": _avg(confidences),
            "first_half_average": first_avg,
            "recent_average": recent_avg,
            "trend": trend,
            "limited_data": len(rated) < MIN_OBSERVATIONS,
        })

    topics.sort(key=lambda t: (
        t["limited_data"],
        t["average_confidence"] if t["average_confidence"] is not None else 99,
        -t["question_count"],
    ))

    most_frequent = sorted(topics, key=lambda t: -t["question_count"])[:5]

    return {
        "total_questions": len(rows),
        "topics": topics,
        "most_frequent": [{"topic": t["topic"], "question_count": t["question_count"]}
                          for t in most_frequent],
        "label": LABEL,
        "min_observations": MIN_OBSERVATIONS,
    }