# Referee Report Worker

This is a Cloudflare Worker that provides a PDF generation API for referee reports.

## Features

- **Server-side PDF Generation**: Uses pdf-lib to overlay text on PDF templates
- **Multi-Category Support**: Handles U9, U11, U13, and U15 age categories
- **CORS Enabled**: Allows cross-origin requests
- **Static Asset Serving**: Bundles PDF templates and fonts
- **Health Check Endpoint**: For monitoring and testing

## API Endpoints

### Health Check
```
GET /
GET /health
```

Returns API information and health status.

**Response:**
```json
{
  "message": "PDF Generator API",
  "endpoint": "POST /api/generate-report",
  "status_endpoint": "GET /api/status (includes template hash check and autotest)",
  "supported_categories": ["U9", "U11", "U13", "U15"],
  "status": "healthy"
}
```

### System Status
```
GET /api/status
GET /api/status?refresh=true
```

Returns detailed system status including template hash verification and autotest results.

**Query Parameters:**
- `refresh` (optional): Set to `true` to bypass cache and force a fresh check

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-13T18:49:45.884Z",
  "templates": [
    {
      "path": "/reports/referee_template_u9.pdf",
      "exists": true,
      "hash": "2c39f190ce628be33404bb62c8b272cba68a6924a2e876095d426da6f6680980",
      "size": 884420,
      "hashValid": true,
      "expectedHash": "2c39f190ce628be33404bb62c8b272cba68a6924a2e876095d426da6f6680980"
    }
  ],
  "font": {
    "exists": true,
    "hash": "0de679de4d3d236c4a60e13bd2cd16d0f93368e9f6ba848385a8023c2e53c202",
    "size": 168644,
    "hashValid": true,
    "expectedHash": "0de679de4d3d236c4a60e13bd2cd16d0f93368e9f6ba848385a8023c2e53c202"
  },
  "autotest": {
    "passed": true,
    "duration": 305
  }
}
```

**Status Values:**
- `healthy`: All templates and fonts present with valid hashes, autotest passed
- `degraded`: Files present but autotest failed
- `unhealthy`: Missing files or hash mismatch detected

**Features:**
- ✅ SHA-256 hash verification for all templates and font
- ✅ Automatic PDF generation test for all age categories (U9, U11, U13, U15)
- ✅ File existence and integrity checks
- ✅ Response caching (1 minute TTL)
- ✅ Detailed error reporting

### Generate Report
```
POST /api/generate-report
```

Generates a PDF referee report.

**Request Body:**
```json
{
  "referee_name_1": "John Doe",
  "referee_name_2": "Jane Smith",
  "match_date": "2025-11-04",
  "starting_hour": "14:00",
  "team_1": "Team A",
  "team_2": "Team B",
  "age_category": "U9",
  "competition": "League Cup",
  "assistant_referee_1": "Assistant 1",
  "assistant_referee_2": "Assistant 2",
  "fourth_official": "Fourth Official",
  "stadium_name": "Stadium Name",
  "stadium_locality": "City"
}
```

**Required Fields:**
- `referee_name_1`
- `match_date` (YYYY-MM-DD format)
- `starting_hour` (HH:MM format)
- `team_1`
- `team_2`
- `age_category` (U9, U11, U13, or U15)

**Age-Specific Required Fields:**
- U11/U13: `referee_name_2` is required

**Response:**
- Content-Type: `application/pdf`
- Binary PDF file

## Local Development

### Install Dependencies
```bash
npm install
```

### Run Development Server
```bash
npm run dev
```

The worker will be available at `http://localhost:8787`

### Build
```bash
npm run build
```

Outputs to `dist/worker.js`

## Deployment

### Deploy to Cloudflare Workers
```bash
npm run deploy
```

### View Logs
```bash
npm run tail
```

## Static Assets

The `public/` directory contains:
- `fonts/Roboto-Medium.ttf`: Font used for PDF overlays
- `reports/`: PDF templates for each age category
  - `referee_template_u9.pdf`
  - `referee_template_u11.pdf`
  - `referee_template_u13.pdf`
  - `referee_template_u15.pdf`

## TypeScript

The worker is written in TypeScript with strict type checking.

To check types:
```bash
npx tsc --noEmit
```

## Architecture

The worker uses:
- **pdf-lib**: For PDF manipulation and text overlays
- **@pdf-lib/fontkit**: For custom font support
- **Cloudflare Workers Runtime**: For serverless execution

The worker fetches PDF templates and fonts from the bound static assets and applies text overlays based on the age category and form data.

## Testing

### Test Health Endpoint
```bash
curl http://localhost:8787/health
```

### Test System Status
```bash
# Normal status check (cached)
curl http://localhost:8787/api/status

# Force refresh status check
curl http://localhost:8787/api/status?refresh=true
```

### Test PDF Generation
```bash
curl -X POST http://localhost:8787/api/generate-report \
  -H "Content-Type: application/json" \
  -d '{
    "referee_name_1": "John Doe",
    "match_date": "2025-11-04",
    "starting_hour": "14:00",
    "team_1": "Team A",
    "team_2": "Team B",
    "age_category": "U9"
  }' \
  --output test-report.pdf
```

## Environment Variables

Set via `wrangler.toml`:
- `ENVIRONMENT`: "development" or "production"

## CORS

CORS is enabled for all origins (`*`). For production, consider restricting to your domain:
```typescript
'Access-Control-Allow-Origin': 'https://your-domain.pages.dev'
```

## License

MIT
