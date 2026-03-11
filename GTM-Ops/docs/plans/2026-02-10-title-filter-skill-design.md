# Title Filter Skill Design

## Overview

A Claude Code skill that filters CSV files by job title/role relevance. Uses a hybrid approach: strict substring matching first, then OpenAI gpt-4o-mini for fuzzy matching on remaining titles. Optimized for cost by deduplicating titles before any processing.

## Skill Interface

**Skill name:** `filter-titles`

**Usage:**
```
/filter-titles /path/to/data.csv --column "Job Title" --project recho
```

**Arguments:**
- **File path** (required) -- absolute path to the CSV
- **`--column`** (required) -- name of the column containing titles
- **`--project`** (required) -- project key from the config file

**Output:**
- New CSV saved as `<original-name>_filtered.csv` in the same directory
- Console summary: total rows, strict matches, AI matches, rows filtered out, estimated API cost

## Processing Pipeline

```
CSV File (50,000 rows)
    |
    v
1. Read CSV & extract title column
    |
    v
2. Deduplicate titles (50,000 -> 2,000 unique)
    |
    v
3. Strict match against project role list
   |-- Matched (1,500) -> include
   +-- Unmatched (500) -> continue
    |
    v
4. Batch unmatched unique titles -> gpt-4o-mini
   (batches of ~100 titles per API call)
    |
    v
5. AI returns Yes/No for each title
   |-- Yes -> include
   +-- No -> exclude
    |
    v
6. Map results back to all 50,000 rows
    |
    v
7. Write matching rows to new CSV
```

### Strict Matching Logic

- Case-insensitive comparison
- Trimmed whitespace
- Substring match: a title matches if it contains any of the role strings
- Example: "VP of Product Management" matches against "VP of Product"

### Batching Strategy

- ~100 unique titles per API call
- Keeps within token limits while minimizing number of calls

## OpenAI API Integration

**Model:** gpt-4o-mini

**API key:** read from `OPENAI_API_KEY` environment variable

**Prompt per batch:**
```
You are a title/role classifier. Given a list of job titles and a list
of desired roles, determine which titles are semantically equivalent to
or a variation of the desired roles.

Desired roles: CEO, Chief Executive Officer, VP Product, Director Marketing, ...

Titles to classify:
1. "Chief Exec. Officer & Co-Founder"
2. "Vice President - Product & Innovation"
3. "Junior Marketing Coordinator"
...

Respond with a JSON array of booleans. true = matches, false = doesn't.
Example: [true, true, false]
```

**Cost estimate (50,000 row file):**
- ~2,000 unique titles -> ~500 sent to AI (after strict match)
- 5 API calls (100 titles each)
- ~2,000 input tokens + ~200 output tokens per call
- gpt-4o-mini pricing: ~$0.15/1M input, ~$0.60/1M output
- Estimated total: less than $0.01

**Error handling:**
- If API call fails, retry once, then skip that batch and log a warning
- If API key is missing, exit early with a clear message

## Project Config

**Config file:** `config/filter-projects.json`

```json
{
  "recho": {
    "description": "Recho target personas",
    "roles": [
      "CEO", "Chief Executive Officer",
      "COO", "Chief Operating Officer",
      "CMO", "Chief Marketing Officer",
      "CPO", "Chief Product Officer",
      "VP Product", "VP of Product", "Product VP",
      "AVP Product", "AVP of Product", "Product AVP",
      "SVP Product", "SVP of Product", "Product SVP",
      "President Product", "Product President",
      "Head Product", "Head of Product", "Product Head",
      "Director Product", "Director of Product", "Product Director",
      "VP Marketing", "VP of Marketing", "Marketing VP",
      "AVP Marketing", "AVP of Marketing", "Marketing AVP",
      "SVP Marketing", "SVP of Marketing", "Marketing SVP",
      "President Marketing", "Marketing President",
      "Head Marketing", "Head of Marketing", "Marketing Head",
      "Director Marketing", "Director of Marketing", "Marketing Director",
      "VP Operations", "VP of Operations", "Operations VP",
      "AVP Operations", "AVP of Operations", "Operations AVP",
      "SVP Operations", "SVP of Operations", "Operations SVP",
      "President Operations", "Operations President",
      "Head Operations", "Head of Operations", "Operations Head",
      "Director Operations", "Director of Operations", "Operations Director"
    ]
  }
}
```

New projects are added by adding entries to this config file.

## File Structure

```
GTM-Ops/
  config/
    filter-projects.json
  scripts/
    filter_titles.py          <- main Python script
  requirements.txt            <- openai dependency
  docs/
    plans/
      2026-02-10-title-filter-skill-design.md

~/.claude/
  skills/
    filter-titles.md          <- Claude Code skill file
```

## Implementation Notes

- The skill file tells Claude to run the Python script with provided arguments
- Python handles CSV parsing, deduplication, strict matching, API calls, and output
- The `openai` Python package is the only external dependency
