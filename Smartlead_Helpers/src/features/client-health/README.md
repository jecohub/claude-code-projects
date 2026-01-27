# Client Health

Quick health overview for key Smartlead clients. Calculates days remaining, email projections, and trend analysis.

## Entry Points

- **CLI**: `npm run health`

## Key Clients (Hardcoded)

1. FilterKing (13264)
2. Iconic (127608)
3. SwayyEm (128520)
4. Sohva Social (77930)
5. Recho (146909)

## Files

- `campaignHealthService.ts` - Main health calculation logic
- `healthCalculator.ts` - Helper functions for status, trends, and projections

## Health Metrics

- **Status**: Full / Prepare / Low / Empty
- **Days Remaining**: Based on sending rate and remaining leads
- **Run Out Date**: Projected date when leads will be exhausted
- **Trend**: Accelerating / Stable / Slowing
- **Emails Remaining**: Breakdown by Not Started vs In Progress

## Usage

```bash
# View health for all key clients
npm run health

# With date filter
npm run health -- --from=2025-01-01
```
