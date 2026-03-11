# Title Filter Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Claude Code skill that filters CSV rows by job title relevance using hybrid strict + AI matching.

**Architecture:** A Claude Code skill file invokes a Python script. The script reads a CSV, deduplicates titles, applies strict substring matching against a project config, sends unmatched titles to OpenAI gpt-4o-mini for fuzzy classification, then writes matching rows to a new CSV.

**Tech Stack:** Python 3.13, openai Python package, Claude Code skills (SKILL.md)

---

### Task 1: Install openai dependency

**Files:**
- Create: `GTM-Ops/requirements.txt`

**Step 1: Create requirements.txt**

Create the file at `/Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops/requirements.txt`:

```
openai>=1.0.0
```

**Step 2: Install the dependency**

Run: `pip3 install -r /Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops/requirements.txt`
Expected: Successfully installed openai

**Step 3: Verify installation**

Run: `python3 -c "import openai; print(openai.__version__)"`
Expected: Prints version number (e.g. 1.x.x)

**Step 4: Commit**

```bash
git -C /Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops add requirements.txt
git -C /Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops commit -m "feat: add openai dependency for title filter"
```

---

### Task 2: Create project config file

**Files:**
- Create: `GTM-Ops/config/filter-projects.json`

**Step 1: Create config directory and file**

Create `/Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops/config/filter-projects.json` with the full Recho role list:

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

**Step 2: Verify JSON is valid**

Run: `python3 -c "import json; json.load(open('/Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops/config/filter-projects.json')); print('Valid JSON')"`
Expected: `Valid JSON`

**Step 3: Commit**

```bash
git -C /Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops add config/filter-projects.json
git -C /Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops commit -m "feat: add Recho project config for title filtering"
```

---

### Task 3: Create the Python filter script

**Files:**
- Create: `GTM-Ops/scripts/filter_titles.py`

**Step 1: Write the complete script**

Create `/Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops/scripts/filter_titles.py`:

```python
import csv
import json
import os
import sys
import argparse
from openai import OpenAI


def load_project_config(project_name: str) -> dict:
    config_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "config",
        "filter-projects.json",
    )
    with open(config_path) as f:
        config = json.load(f)
    if project_name not in config:
        available = ", ".join(config.keys())
        print(f"Error: Project '{project_name}' not found. Available: {available}")
        sys.exit(1)
    return config[project_name]


def strict_match(title: str, roles: list[str]) -> bool:
    title_lower = title.strip().lower()
    for role in roles:
        if role.strip().lower() in title_lower:
            return True
    return False


def classify_titles_with_ai(
    titles: list[str], roles: list[str], api_key: str, batch_size: int = 100
) -> dict[str, bool]:
    client = OpenAI(api_key=api_key)
    results = {}
    roles_str = ", ".join(roles)
    total_input_tokens = 0
    total_output_tokens = 0

    for i in range(0, len(titles), batch_size):
        batch = titles[i : i + batch_size]
        numbered_titles = "\n".join(
            f'{idx + 1}. "{t}"' for idx, t in enumerate(batch)
        )

        prompt = (
            "You are a job title classifier. Given desired roles and a list of job titles, "
            "determine which titles are semantically equivalent to, a variation of, or a "
            "senior-level version of the desired roles.\n\n"
            f"Desired roles: {roles_str}\n\n"
            f"Titles to classify:\n{numbered_titles}\n\n"
            "Respond with ONLY a JSON array of booleans (true/false), one per title. "
            "true = matches a desired role, false = does not match.\n"
            f"The array must have exactly {len(batch)} elements."
        )

        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
            )
            total_input_tokens += response.usage.prompt_tokens
            total_output_tokens += response.usage.completion_tokens

            content = response.choices[0].message.content.strip()
            # Strip markdown code fences if present
            if content.startswith("```"):
                content = content.split("\n", 1)[1]
                content = content.rsplit("```", 1)[0].strip()
            matches = json.loads(content)

            if len(matches) != len(batch):
                print(
                    f"Warning: AI returned {len(matches)} results for batch of {len(batch)}. Retrying..."
                )
                # Retry once
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0,
                )
                total_input_tokens += response.usage.prompt_tokens
                total_output_tokens += response.usage.completion_tokens
                content = response.choices[0].message.content.strip()
                if content.startswith("```"):
                    content = content.split("\n", 1)[1]
                    content = content.rsplit("```", 1)[0].strip()
                matches = json.loads(content)

            for title, is_match in zip(batch, matches):
                results[title] = bool(is_match)

        except Exception as e:
            print(f"Warning: API call failed for batch starting at index {i}: {e}")
            print("Retrying once...")
            try:
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0,
                )
                total_input_tokens += response.usage.prompt_tokens
                total_output_tokens += response.usage.completion_tokens
                content = response.choices[0].message.content.strip()
                if content.startswith("```"):
                    content = content.split("\n", 1)[1]
                    content = content.rsplit("```", 1)[0].strip()
                matches = json.loads(content)
                for title, is_match in zip(batch, matches):
                    results[title] = bool(is_match)
            except Exception as e2:
                print(f"Error: Retry failed: {e2}. Skipping batch.")
                for title in batch:
                    results[title] = False

    # Cost estimate (gpt-4o-mini pricing)
    input_cost = (total_input_tokens / 1_000_000) * 0.15
    output_cost = (total_output_tokens / 1_000_000) * 0.60
    total_cost = input_cost + output_cost

    return results, total_cost, total_input_tokens, total_output_tokens


def main():
    parser = argparse.ArgumentParser(description="Filter CSV by job title relevance")
    parser.add_argument("file", help="Path to the CSV file")
    parser.add_argument("--column", required=True, help="Name of the title/role column")
    parser.add_argument("--project", required=True, help="Project key from config")
    args = parser.parse_args()

    # Validate file exists
    if not os.path.isfile(args.file):
        print(f"Error: File not found: {args.file}")
        sys.exit(1)

    # Load project config
    project = load_project_config(args.project)
    roles = project["roles"]

    # Check API key
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY environment variable not set.")
        sys.exit(1)

    # Read CSV
    with open(args.file, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if args.column not in reader.fieldnames:
            print(f"Error: Column '{args.column}' not found. Available: {', '.join(reader.fieldnames)}")
            sys.exit(1)
        rows = list(reader)
        fieldnames = reader.fieldnames

    total_rows = len(rows)
    print(f"Read {total_rows} rows from {args.file}")

    # Deduplicate titles
    unique_titles = set()
    for row in rows:
        title = row[args.column].strip()
        if title:
            unique_titles.add(title)
    print(f"Found {len(unique_titles)} unique titles")

    # Phase 1: Strict matching
    strict_matched = set()
    strict_unmatched = []
    for title in unique_titles:
        if strict_match(title, roles):
            strict_matched.add(title)
        else:
            strict_unmatched.append(title)
    print(f"Strict match: {len(strict_matched)} matched, {len(strict_unmatched)} unmatched")

    # Phase 2: AI matching on unmatched titles
    ai_matched = set()
    total_cost = 0
    total_input_tokens = 0
    total_output_tokens = 0

    if strict_unmatched:
        print(f"Sending {len(strict_unmatched)} titles to gpt-4o-mini for classification...")
        ai_results, total_cost, total_input_tokens, total_output_tokens = classify_titles_with_ai(
            strict_unmatched, roles, api_key
        )
        for title, is_match in ai_results.items():
            if is_match:
                ai_matched.add(title)
        print(f"AI match: {len(ai_matched)} additional matches")

    # Combine matches
    all_matched = strict_matched | ai_matched

    # Filter rows
    filtered_rows = []
    for row in rows:
        title = row[args.column].strip()
        if title in all_matched:
            filtered_rows.append(row)

    # Write output
    base, ext = os.path.splitext(args.file)
    output_path = f"{base}_filtered{ext}"
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(filtered_rows)

    # Summary
    print(f"\n{'='*50}")
    print(f"FILTER SUMMARY")
    print(f"{'='*50}")
    print(f"Total rows:        {total_rows}")
    print(f"Unique titles:     {len(unique_titles)}")
    print(f"Strict matches:    {len(strict_matched)}")
    print(f"AI matches:        {len(ai_matched)}")
    print(f"Total matches:     {len(all_matched)}")
    print(f"Rows kept:         {len(filtered_rows)}")
    print(f"Rows filtered out: {total_rows - len(filtered_rows)}")
    if strict_unmatched:
        print(f"API cost:          ${total_cost:.4f}")
        print(f"Tokens used:       {total_input_tokens} in / {total_output_tokens} out")
    print(f"Output saved to:   {output_path}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
```

**Step 2: Verify script syntax**

Run: `python3 -c "import py_compile; py_compile.compile('/Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops/scripts/filter_titles.py', doraise=True); print('Syntax OK')"`
Expected: `Syntax OK`

**Step 3: Verify --help works**

Run: `python3 /Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops/scripts/filter_titles.py --help`
Expected: Prints usage info showing `file`, `--column`, and `--project` arguments

**Step 4: Commit**

```bash
git -C /Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops add scripts/filter_titles.py
git -C /Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops commit -m "feat: add title filter Python script with hybrid matching"
```

---

### Task 4: Create test CSV and run end-to-end test

**Files:**
- Create: `GTM-Ops/tests/test_data.csv` (temporary, for testing)

**Step 1: Create test CSV**

Create `/Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops/tests/test_data.csv`:

```csv
Name,Job Title,Company
Alice,CEO,Acme Inc
Bob,Software Engineer,TechCo
Carol,VP of Product Management,BigCorp
Dave,Chief Executive Officer & Founder,StartupXYZ
Eve,Junior Marketing Coordinator,AgencyCo
Frank,Director of Operations,OpsCorp
Grace,Receptionist,FrontDesk LLC
Hank,V.P. Marketing,AdTech
Iris,Head of Product,ProductCo
Jack,Data Analyst,DataCo
```

This has 10 rows: 7 should match (Alice, Carol, Dave, Frank, Hank, Iris + potentially Eve via AI but shouldn't), 3 should not (Bob, Eve, Grace, Jack).

**Step 2: Run the filter script**

Run: `OPENAI_API_KEY=<key> python3 /Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops/scripts/filter_titles.py /Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops/tests/test_data.csv --column "Job Title" --project recho`

Expected:
- Strict matches: CEO, VP of Product Management (substring of "VP of Product"), Chief Executive Officer & Founder (substring of "Chief Executive Officer"), Director of Operations (substring of "Director of Operations"), Head of Product (substring of "Head of Product") = 5 strict
- AI should match: "V.P. Marketing" and possibly "VP of Product Management" if not already strict matched
- Output file: `tests/test_data_filtered.csv`
- Summary shows rows kept vs filtered out

**Step 3: Verify output CSV**

Read the output CSV and confirm it contains only matching rows and excludes Software Engineer, Receptionist, Data Analyst, Junior Marketing Coordinator.

**Step 4: Clean up test files**

Delete `tests/test_data.csv` and `tests/test_data_filtered.csv` after verifying.

---

### Task 5: Create the Claude Code skill file

**Files:**
- Create: `~/.claude/skills/filter-titles/SKILL.md`

**Step 1: Create the skill file**

Create `/Users/jericodelacruz/.claude/skills/filter-titles/SKILL.md`:

```markdown
---
name: filter-titles
description: Filter CSV files by job title/role relevance using hybrid strict + AI matching. Provide a CSV path, column name, and project key.
---

# Title Filter

Filters CSV rows by whether their job title matches desired roles for a project.

## Usage

User provides arguments like: `/filter-titles /path/to/file.csv --column "Job Title" --project recho`

Parse the arguments from ARGUMENTS below and run:

```bash
OPENAI_API_KEY=key_PXsYDtj02hTXHm2A python3 /Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops/scripts/filter_titles.py <file_path> --column "<column_name>" --project <project_name>
```

## Arguments

- First argument: path to the CSV file
- `--column`: name of the column containing job titles
- `--project`: project key (e.g., recho)

## Available Projects

Check `/Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops/config/filter-projects.json` for available projects and their role lists.

## Output

The script will:
1. Read the CSV and deduplicate titles
2. Apply strict substring matching against the project's role list
3. Send unmatched titles to OpenAI gpt-4o-mini for fuzzy classification
4. Save matching rows to `<filename>_filtered.csv` in the same directory
5. Print a summary with match counts and API cost

Display the full summary output to the user.
```

**Step 2: Verify skill appears in Claude Code**

Restart Claude Code or check that `/filter-titles` appears as an available skill.

**Step 3: Commit**

```bash
git -C /Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops commit -m "feat: add filter-titles Claude Code skill"
```

Note: The skill file is in `~/.claude/skills/` which is outside the GTM-Ops repo. It won't be tracked by this repo's git. This is fine — skills are user-level configuration.

---

### Task 6: End-to-end test via skill invocation

**Step 1: Invoke the skill**

In a new Claude Code session, run: `/filter-titles /Users/jericodelacruz/Desktop/Claude_Code_Projects/GTM-Ops/tests/test_data.csv --column "Job Title" --project recho`

**Step 2: Verify output**

Confirm the skill correctly runs the Python script, produces a filtered CSV, and displays the summary.
