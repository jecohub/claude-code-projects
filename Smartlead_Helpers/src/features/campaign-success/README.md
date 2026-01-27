# Campaign Success Analysis

Ranks and analyzes campaign performance using a composite scoring system.

## Entry Points

- **CLI**: `npm run analyze -- --clientId=<ID>`

## Files

- Located in `scripts/analyze-campaign-success.ts` (CLI entry)

## Scoring System

Composite score based on weighted metrics:
- **Sends**: 10% - Volume matters but not too much
- **Opens**: 20% - Opens indicate interest
- **Clicks**: 25% - Clicks show deeper engagement
- **Positive Responses**: 45% - Ultimate goal

## Positive Responses

Counted from AI categorization:
- Interested
- Meeting Request
- Information Request

## Usage

```bash
# Analyze all campaigns for a client
npm run analyze -- --clientId=77930

# Save to file
npm run analyze -- --clientId=77930 --output=./reports/success.json

# Include inactive campaigns
npm run analyze -- --clientId=77930 --include-inactive

# Verbose mode
npm run analyze -- --clientId=77930 -v
```

## Output

- Campaign rankings by composite score
- Engagement metrics per campaign
- Lead categorization breakdown
- Top performers by different metrics
- Aggregated statistics across all campaigns
