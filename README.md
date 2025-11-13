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
  "supported_categories": ["U9", "U11", "U13", "U15"],
  "status": "healthy"
}
```

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
