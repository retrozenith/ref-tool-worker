# Referee Report Worker

This is a Cloudflare Worker that provides a PDF generation API for referee reports.

## Features

- **Server-side PDF Generation**: Uses pdf-lib to overlay text on PDF templates
- **Multi-Category Support**: Handles U9-U17, Liga 2/3, Youth League, National Championships
- **Multi-Locality Support**: Supports Ilfov (AJF) and FRF (National) referee associations
- **Template Integrity**: SHA-256 hash verification for all templates
- **Automatic Testing**: Built-in autotest for all categories and localities
- **Flexible Coordinates**: Per-locality, per-category coordinate configurations
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
  "supported_localities": ["Ilfov", "frf"],
  "supported_by_locality": {
    "Ilfov": ["U9", "U11", "U13", "U15"],
    "frf": ["U11", "U12", "U13", "U14", "U15", "U16", "U17", "U17F", "LIGA2", "LIGA3", "LIGAT", "CN"]
  },
  "status": "healthy"
}
```

### System Status
```
GET /api/status
GET /api/status?refresh=true
```

Returns detailed system status including template hash verification and autotest results.

**Performance Optimization:**
- ⚡ Status check runs **once on worker startup** and is cached permanently
- Subsequent requests return instantly from cache (no CPU overhead)
- Use `?refresh=true` to force a new check (expensive, ~2-3 seconds)

**Query Parameters:**
- `refresh` (optional): Set to `true` to bypass cache and force a fresh check with full hash validation and autotest

**Features:**
- ✅ Template existence verification for all localities
- ✅ SHA-256 hash validation (on refresh only)
- ✅ Automatic PDF generation test for all age categories (on refresh only)
- ✅ File existence and integrity checks
- ✅ Instant response from cache
- ✅ Detailed error reporting
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
  "locality": "Ilfov",
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
- `age_category` (see supported categories per locality)
- `locality` (Ilfov or frf)

**Supported Categories by Locality:**
- **Ilfov**: U9, U11, U13, U15
- **frf**: U11, U12, U13, U14, U15, U16, U17, U17F (U17 feminin), LIGA2, LIGA3, LIGAT (Liga Tineret), CN (Campionate Nationale)

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
- `reports/{locality}/`: PDF templates organized by referee association locality
  - **Ilfov (AJF Ilfov)**:
    - `reports/Ilfov/referee_template_u9.pdf`
    - `reports/Ilfov/referee_template_u11.pdf`
    - `reports/Ilfov/referee_template_u13.pdf`
    - `reports/Ilfov/referee_template_u15.pdf`
  - **frf (Federația Română de Fotbal)**:
    - `reports/frf/referee_template-Interliga-U11.pdf`
    - `reports/frf/referee_template-Interliga-U12.pdf`
    - `reports/frf/referee_template-liga-elitelor_U13.pdf`
    - `reports/frf/referee_template-liga-elitelor_U14.pdf`
    - `reports/frf/referee_template-liga-elitelor_U15.pdf`
    - `reports/frf/referee_template-liga-elitelor_U16.pdf`
    - `reports/frf/referee_template-liga-elitelor_U17.pdf`
    - `reports/frf/referee_template-liga-elitelor_U17 feminin.pdf`
    - `reports/frf/referee_template-liga-2.pdf`
    - `reports/frf/referee_template-liga-3.pdf`
    - `reports/frf/referee_template-liga-de-Tineret.pdf`
    - `reports/frf/referee_template-campionate-nationale.pdf`

### Adding New Localities

To add support for a new referee association:

1. **Create directory**: `public/reports/{locality}/`
2. **Add templates**: PDF files for supported age categories
3. **Update `LOCALITY_TEMPLATES`** in `src/index.ts`:
   ```typescript
   const LOCALITY_TEMPLATES: Record<string, Record<string, string>> = {
     'Ilfov': { ... },
     'frf': { ... },
     'NewLocality': {
       'U15': 'template_u15.pdf',
       // ... other categories
     },
   };
   ```
4. **Configure coordinates** in `OVERLAY_CONFIGS`:
   ```typescript
   'NewLocality': {
     'U15': {
       overlays: [
         { x: 100, y: 500, page: 0, field: 'referee_name_1' },
         // ... other fields
       ],
     },
   }
   ```
5. **Add to supported localities**:
   ```typescript
   const SUPPORTED_LOCALITIES = ['Ilfov', 'frf', 'NewLocality'] as const;
   ```
6. **Add hash entries** to `KNOWN_GOOD_HASHES.templates` (optional for validation)
7. **Add test cases** to `runAutotest()` function
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
    "age_category": "U9",
    "locality": "Ilfov"
  }' \
  --output test-report.pdf
```
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
