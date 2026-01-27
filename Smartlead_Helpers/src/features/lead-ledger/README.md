# Lead Ledger

SQLite database for tracking all uploaded leads. Prevents duplicate uploads and enables retargeting exports.

## Entry Points

- **CLI**: `npm run ledger:init` - Initialize database
- **CLI**: `npm run ledger:record` - Record manual UI uploads
- **CLI**: `npm run ledger:export` - Export leads for retargeting
- **CLI**: `npm run ledger:clients` - Import client list

## Files

- `leadLedger.ts` - Main SQLite service

## Database Location

Default: `./data/lead-ledger.sqlite`

Override with: `LEAD_LEDGER_DB_PATH` environment variable

## Usage

```bash
# Initialize database
npm run ledger:init

# Record a manual upload (done via Smartlead UI)
npm run ledger:record -- --campaignId=12345 --csv=./leads.csv

# Export leads not contacted in 90 days
npm run ledger:export -- --days=90 --out=./retarget.csv

# Import clients from TSV file
npm run ledger:clients -- --file=./clients.tsv
```

## Features

1. **Duplicate Prevention** - Tracks all uploaded emails
2. **Retarget Export** - Export leads not contacted in N days
3. **Client Tracking** - Associate leads with clients
4. **Invalid Email Flagging** - Mark bounced/invalid emails
5. **Unsubscribe Tracking** - Flag unsubscribed leads
