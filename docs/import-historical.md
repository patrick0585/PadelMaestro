# Historical Data Import

Imports the pre-MVP spreadsheet data into the database.

## Expected Input Format

A JSON file with this shape:

```json
{
  "players": [
    { "name": "Paul", "email": "paul@example.com" },
    { "name": "Werner", "email": "werner@example.com" }
  ],
  "gameDays": [
    {
      "date": "2026-01-07",
      "playerCount": 5,
      "matches": [
        {
          "matchNumber": 1,
          "team1": ["Paul", "Werner"],
          "team2": ["Rene", "Thomas"],
          "team1Score": 3,
          "team2Score": 0
        }
      ]
    }
  ]
}
```

## Notes

- Imported players have `passwordHash = null`; invite them via the admin panel to let them log in.
- Import is idempotent on player email (upserts), but not on game days — reset the DB before re-running if needed.
- Match pairings are taken as-is. They do not have to match the template — this is historical data.

## Running

```bash
pnpm import:historical ./data/historical-export.json
```
