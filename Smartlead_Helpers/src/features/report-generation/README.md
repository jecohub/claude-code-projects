# Report Generation

Generates comprehensive campaign reports for Smartlead clients.

## Entry Points

- **CLI**: `npm run report -- --clientId=<ID>`
- **CLI (JSON)**: `npm run report:json -- --clientId=<ID>`

## Dependencies

- `src/core/smartleadClient.ts` - Smartlead API client
- `src/features/client-health/` - Health metrics calculation

## Usage

```bash
# Basic text report
npm run report -- --clientId=128520

# With date filter
npm run report -- --clientId=128520 --from="2025-01-01"

# JSON output
npm run report -- --clientId=128520 --format=json > report.json
```

## Output

Reports include:
- Overall campaign statistics
- Active leads summary
- Paused campaigns list
- Email engagement metrics
- Per-campaign details
- Campaign health metrics
