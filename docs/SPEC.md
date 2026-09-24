# AI Interview Preparation Kit — Assessment Brief

**TRAO_DOCUMENT_TYPE**: ENGINEERING_ASSESSMENT | **TRAO_ASSESSMENT_ID**: FS-AI-INTERVIEW-01 | **TRAO_AI_USE**: assistive-permitted

---

## 1. Overview
Build a web application that turns a job description into a personalised interview preparation kit.
The user pastes in the job description, gives you the company's website address, and tells you how many days they have before the interview. From there the application does the research itself: it crawls the company site to find what they do and how they hire, looks for public discussion of that company's interview process, and combines all of it with the job description to generate a structured kit — a company brief, a breakdown of the role, a bank of likely questions, flashcards, and a day-by-day study schedule. The user can then reshape any part of it, and practise against it inside the app.

---

## 2. Preferred Tech Stack
- **Frontend**: Next.js + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: MongoDB
- **Language**: JavaScript or TypeScript (TypeScript strict)
- **Scraping**: Safe fetcher + crawler
- **LLM**: Gemini Flash (free tier with token-bucket rate limiter)

---

## 3. Core Requirements

### 1. Authentication
- Secure registration, login and logout with session handling (httpOnly cookie, hashed token in Mongo TTL index).
- Users can read and modify only their own kits.
- Sensible handling of expired or invalid sessions.

### 2. Input and Research
- Textarea for JD, field for company website, days input.
- File upload for batch / multiple roles.
- Best-first crawl of company site (homepage, /careers, /jobs, handbook, blog) to find what they do and how they hire.
- Search public discussion (e.g. Hacker News Algolia).
- Skip and report unretrievable sources rather than failing the whole run.
- Rate-limit requests and exponential backoff on failure. Respect robots.txt.
- Local URLs supported (for test evaluation).

### 3. Research and Sequencing
1. Extract requirements from JD with verbatim evidence.
2. Crawl and rank company links.
3. Search public discussion.
4. Generate company brief and role breakdown.
5. Generate questions per category (technical, behavioural, system-design, company-fit).
6. Compare questions against requirements (pure function coverage check).
7. Second pass refill loop for gaps.
8. Generate flashcards.
9. Pure function day-by-day schedule generation.

### 4. The Second Pass (Coverage Refill Loop)
- Compare generated questions against extracted requirements.
- Gap requirements are refilled in subsequent passes (max 2 refills).
- If still uncovered, inject deterministic fallback template question marked `origin: fallback`.

### 5. The Kit Structure (Appendix A)
- Strict compliance with Appendix A schema.
- Stable IDs (`r1`, `q1`, `f1`).
- Enums: `kind: technical | behavioural | domain`, `priority: must | nice`, `category: technical | behavioural | system-design | company-fit`.
- `difficulty: 1 | 2 | 3`. `minutes: integer`.

### 6. The Builder
- Inline editing of questions, answers, flashcards, brief.
- Reorder questions and move across categories.
- Add and delete items.
- Single section regeneration: preserves user edits and pinned items (`meta: { origin, edited, pinned, rev }`).

### 7. Practice Mode
- Flashcard flip mode with answer reveal.
- Confidence ratings 1-3.
- Need-score tracking via exponential moving average (unseen = 0.6, 1.25x for must requirements).

### 8. The Schedule
- Pure function: arithmetic and allocation.
- Number of days equals requested days.
- Integer minutes. Focus, question IDs, minutes per day.
- Must-have and harder material scheduled earlier.

### 9. Batch Entry Point (Mandatory)
`npm run evaluate -- --input <cases.json> --output <kits.json>`
- Runs full pipeline headlessly from clean clone.
- Format matches Appendix B.

### 10. Edge Cases & Resilience
- Invalid/404/timeout company URL -> status `ok` with gap recorded in brief/warnings.
- Thin 2-line JD -> thin kit with warnings, never hallucinate requirements.
- Rate limit handling with token estimation and retry backoff.
- Deduplication: same JD + company per user returns existing kit or debounces.

### 11. Security
- SSRF prevention: reject private/loopback IPs in production, allow-local for evaluation.
- Delimited data blocks: prompt injection protection.
- Text-only UI rendering.

---

## Appendix A — Kit Structure
```json
{
  "source": {
    "company": "",
    "company_url": "",
    "role": "",
    "location": "",
    "jd_chars": 0,
    "researched_at": "",
    "pages_used": ["https://..."]
  },
  "company_brief": {
    "summary": "",
    "what_they_do": "",
    "sources": ["https://..."]
  },
  "role": {
    "title": "",
    "seniority": "",
    "responsibilities": [""],
    "requirements": [
      {
        "id": "r1",
        "text": "5+ years with React",
        "kind": "technical",
        "priority": "must"
      }
    ]
  },
  "questions": [
    {
      "id": "q1",
      "requirement_ids": ["r1"],
      "category": "technical",
      "prompt": "",
      "answer_outline": "",
      "difficulty": 2
    }
  ],
  "flashcards": [
    {
      "id": "f1",
      "front": "",
      "back": "",
      "requirement_ids": ["r1"]
    }
  ],
  "schedule": {
    "days_available": 5,
    "days": [
      {
        "day": 1,
        "focus": "",
        "question_ids": ["q1"],
        "minutes": 60
      }
    ]
  },
  "coverage": {
    "uncovered_requirement_ids": [],
    "passes": 2
  }
}
```

---

## Appendix B — Batch Input and Output

### Input Format (`cases.json`)
```json
[
  {
    "id": "case-01",
    "jd": "Senior Backend Engineer\n\nWe are looking for ...",
    "company_url": "http://localhost:8099/acme/",
    "days": 5
  }
]
```

### Output Format (`kits.json`)
```json
{
  "version": "1.0",
  "generated_at": "2026-09-01T09:12:44Z",
  "kits": [
    {
      "id": "case-01",
      "status": "ok",
      "kit": { /* Appendix A structure */ },
      "error": null
    },
    {
      "id": "case-04",
      "status": "failed",
      "kit": null,
      "error": {
        "code": "COMPANY_UNREACHABLE",
        "message": "Company site unreachable after 3 retries."
      }
    }
  ]
}
```
