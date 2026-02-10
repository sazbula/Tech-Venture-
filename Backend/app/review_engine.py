from typing import Any, Dict, Optional


def run_review(diff_text: str, repo_path: Optional[str] = None) -> Dict[str, Any]:
    return {
        "comments": [
            {
                "severity": "low",
                "category": "maintainability",
                "file": "N/A",
                "line_range": "N/A",
                "snippet": "Stub review result. RLM integration pending.",
                "issue": "No real analysis has been run.",
                "why_it_matters": "This demonstrates the end-to-end backend flow.",
                "suggested_fix": ["Integrate the real RLM-based review engine here later."],
                "confidence": "high",
                "evidence": ["diff"],
            }
        ],
        "meta": {
            "engine": "stub",
            "notes": "RLM + repo graph + GitHub ingestion will be added later.",
        },
    }
