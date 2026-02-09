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
) -> tuple[dict[str, bool], float, int, int]:
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
