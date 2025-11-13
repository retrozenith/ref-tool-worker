import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export interface FormData {
  referee_name_1: string;
  referee_name_2?: string;
  match_date: string;
  starting_hour: string;
  team_1: string;
  team_2: string;
  competition?: string;
  assistant_referee_1?: string;
  assistant_referee_2?: string;
  fourth_official?: string;
  age_category: 'U9' | 'U11' | 'U13' | 'U15';
  stadium_name?: string;
  stadium_locality?: string;
}

interface TextOverlay {
  text: string;
  x: number;
  y: number;
  page: number;
}

export interface Env {
  ASSETS: Fetcher;
}

interface TemplateStatus {
  path: string;
  exists: boolean;
  hash?: string;
  size?: number;
  error?: string;
  hashValid?: boolean;
  expectedHash?: string;
}

interface SystemStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  templates: TemplateStatus[];
  font: {
    exists: boolean;
    hash?: string;
    size?: number;
    error?: string;
    hashValid?: boolean;
    expectedHash?: string;
  };
  autotest?: {
    passed: boolean;
    errors?: string[];
    duration?: number;
  };
  issues?: string[];
}

let cachedSystemStatus: SystemStatus | null = null;
let lastStatusCheck: number = 0;
const STATUS_CACHE_TTL = 60000; // 1 minute

// Known good hashes for templates and font (baseline)
const KNOWN_GOOD_HASHES = {
  templates: {
    '/reports/referee_template_u9.pdf': '2c39f190ce628be33404bb62c8b272cba68a6924a2e876095d426da6f6680980',
    '/reports/referee_template_u11.pdf': '3996ff002d0c86c1e2902255c2fccf02c5538c0c6f72b9d3aba16f3fc56de925',
    '/reports/referee_template_u13.pdf': '2bce26208461dccb0a375847ecc8954df47ec9e98c2cca3de4533914a4a8b432',
    '/reports/referee_template_u15.pdf': 'bc99e407ff955a3c417596ed2fc2a1d3d69fc069693ce55f14e9d638c5e257d1',
  },
  font: '0de679de4d3d236c4a60e13bd2cd16d0f93368e9f6ba848385a8023c2e53c202',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowedOrigins = [
      'https://ref-tool-frontend.pages.dev',
      'https://rapoarte.cristeavictor.xyz'
    ];
    
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // System status endpoint with hash check
    if (url.pathname === '/api/status') {
      try {
        const forceRefresh = url.searchParams.get('refresh') === 'true';
        const status = await getSystemStatus(env, forceRefresh);
        
        return new Response(JSON.stringify(status, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
          status: status.status === 'healthy' ? 200 : 503,
        });
      } catch (error) {
        return new Response(JSON.stringify({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      }
    }

    // Health check endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        message: 'PDF Generator API',
        endpoint: 'POST /api/generate-report',
        status_endpoint: 'GET /api/status (includes template hash check and autotest)',
        supported_categories: ['U9', 'U11', 'U13', 'U15'],
        status: 'healthy'
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // Generate report endpoint
    if (url.pathname === '/api/generate-report' && request.method === 'POST') {
      try {
        const formData: FormData = await request.json();

        // Validate required fields
        const validationError = validateFormData(formData);
        if (validationError) {
          return new Response(JSON.stringify({
            error: 'Validation failed',
            details: validationError
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          });
        }

        // Generate PDF
        const pdfBuffer = await generateReport(formData, env);
        const filename = generateFilename(formData);

        return new Response(pdfBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': pdfBuffer.byteLength.toString(),
            ...corsHeaders,
          },
        });

      } catch (error) {
        console.error('Error generating PDF:', error);
        return new Response(JSON.stringify({
          error: 'Internal server error',
          details: error instanceof Error ? error.message : 'Unknown error'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      }
    }

    return new Response('Not Found', {
      status: 404,
      headers: corsHeaders,
    });
  },
};

function validateFormData(formData: FormData): string | null {
  const required = ['referee_name_1', 'match_date', 'starting_hour', 'team_1', 'team_2', 'age_category'];

  for (const field of required) {
    if (!formData[field as keyof FormData] || formData[field as keyof FormData]?.toString().trim() === '') {
      return `Missing required field: ${field}`;
    }
  }

  if (!['U9', 'U11', 'U13', 'U15'].includes(formData.age_category)) {
    return 'Invalid age category. Must be U9, U11, U13, or U15';
  }

  if ((formData.age_category === 'U11' || formData.age_category === 'U13') &&
    (!formData.referee_name_2 || formData.referee_name_2.trim() === '')) {
    return 'referee_name_2 is required for U11 and U13 categories';
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(formData.match_date)) {
    return 'match_date must be in YYYY-MM-DD format';
  }

  const timeRegex = /^\d{2}:\d{2}$/;
  if (!timeRegex.test(formData.starting_hour)) {
    return 'starting_hour must be in HH:MM format';
  }

  return null;
}

async function generateReport(formData: FormData, env: Env): Promise<Uint8Array> {
  const templatePath = `/reports/referee_template_${formData.age_category.toLowerCase()}.pdf`;
  const overlays = getOverlays(formData);

  return await applyOverlays(templatePath, overlays, env);
}

function getOverlays(formData: FormData): TextOverlay[] {
  const overlays: TextOverlay[] = [];

  switch (formData.age_category) {
    case 'U9':
      overlays.push(...getU9Overlays(formData));
      break;
    case 'U11':
    case 'U13':
      overlays.push(...getU11U13Overlays(formData));
      break;
    case 'U15':
      overlays.push(...getU15Overlays(formData));
      break;
  }

  return overlays;
}

function getU9Overlays(formData: FormData): TextOverlay[] {
  return [
    { text: formData.referee_name_1, x: 101, y: 687, page: 0 },
    { text: formatDate(formData.match_date, 'U9'), x: 337, y: 686, page: 0 },
    { text: formData.team_1 + " - " + formData.team_2, x: 101, y: 712, page: 0 },
    { text: formData.team_1, x: 101, y: 636, page: 0 },
    { text: formData.team_2, x: 355, y: 636, page: 0 }
  ];
}

function getU11U13Overlays(formData: FormData): TextOverlay[] {
  return [
    { text: formData.referee_name_1, x: 101, y: 687, page: 0 },
    { text: formData.referee_name_2 || '', x: 101, y: 662, page: 0 },
    { text: formatDate(formData.match_date, formData.age_category), x: 346, y: 686, page: 0 },
    { text: formData.starting_hour, x: 335, y: 660, page: 0 },
    { text: formData.team_1 + " - " + formData.team_2, x: 101, y: 712, page: 0 },
    { text: formData.team_1, x: 101, y: 636, page: 0 },
    { text: formData.team_2, x: 355, y: 636, page: 0 },
  ];
}

function getU15Overlays(formData: FormData): TextOverlay[] {
  const overlays: TextOverlay[] = [
    { text: formData.referee_name_1, x: 163, y: 353, page: 0 },
    { text: formData.assistant_referee_1 || '', x: 163, y: 338, page: 0 },
    { text: formData.assistant_referee_2 || '', x: 163, y: 321, page: 0 },
    { text: formData.fourth_official || '', x: 163, y: 305, page: 0 },
    { text: formatDate(formData.match_date, 'U15'), x: 390, y: 425, page: 0 },
    { text: formData.starting_hour, x: 510, y: 425, page: 0 },
    { text: formData.team_1 + " - " + formData.team_2, x: 110, y: 515, page: 0 },
    { text: formData.competition || '', x: 110, y: 453, page: 0 },
    { text: formData.stadium_name || '', x: 150, y: 399, page: 0 },
    { text: formData.stadium_locality || '', x: 163, y: 426, page: 0 },
    { text: formatDate(formData.match_date, 'U15'), x: 90, y: 78, page: 4 },
    { text: formData.team_1, x: 150, y: 783, page: 5 },
    { text: formData.team_2, x: 160, y: 783, page: 6 }
  ];

  overlays.push(
    { text: 'Ilfov', x: 490, y: 353, page: 0 },
    { text: 'Ilfov', x: 490, y: 337, page: 0 },
    { text: 'Ilfov', x: 490, y: 322, page: 0 },
    { text: 'Ilfov', x: 490, y: 305, page: 0 }
  );

  return overlays;
}

function formatDate(dateString: string, ageCategory: string): string {
  const date = new Date(dateString);

  if (ageCategory === 'U15') {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  } else {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}     ${month}`;
  }
}

async function applyOverlays(templatePath: string, overlays: TextOverlay[], env: Env): Promise<Uint8Array> {
  // Fetch template PDF from assets
  const templateResponse = await env.ASSETS.fetch(new Request(`https://dummy.com${templatePath}`));
  if (!templateResponse.ok) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  const templateBytes = await templateResponse.arrayBuffer();
  const pdfDoc = await PDFDocument.load(templateBytes);

  // Register fontkit
  pdfDoc.registerFontkit(fontkit);

  // Load custom font
  const fontResponse = await env.ASSETS.fetch(new Request('https://dummy.com/fonts/Roboto-Medium.ttf'));
  if (!fontResponse.ok) {
    throw new Error('Font not found');
  }
  const fontBytes = await fontResponse.arrayBuffer();
  const customFont = await pdfDoc.embedFont(new Uint8Array(fontBytes));

  // Group overlays by page
  const overlaysByPage = new Map<number, TextOverlay[]>();
  for (const overlay of overlays) {
    if (!overlaysByPage.has(overlay.page)) {
      overlaysByPage.set(overlay.page, []);
    }
    overlaysByPage.get(overlay.page)!.push(overlay);
  }

  // Apply overlays
  for (const [pageIndex, pageOverlays] of overlaysByPage.entries()) {
    if (pageIndex >= pdfDoc.getPageCount()) {
      console.warn(`Skipping page ${pageIndex} - PDF only has ${pdfDoc.getPageCount()} pages`);
      continue;
    }

    const page = pdfDoc.getPage(pageIndex);

    for (const overlay of pageOverlays) {
      if (overlay.text.trim()) {
        page.drawText(overlay.text, {
          x: overlay.x,
          y: overlay.y,
          size: 13,
          font: customFont,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

function generateFilename(formData: FormData): string {
  const dateStr = formData.match_date.replace(/[-\/]/g, '');
  const team1Clean = formData.team_1.replace(/[^a-zA-Z0-9]/g, '');
  const team2Clean = formData.team_2.replace(/[^a-zA-Z0-9]/g, '');

  return `referee_report_${formData.age_category}_${team1Clean}_vs_${team2Clean}_${dateStr}.pdf`;
}

async function getSystemStatus(env: Env, forceRefresh: boolean = false): Promise<SystemStatus> {
  const now = Date.now();
  
  // Return cached status if available and not expired
  if (!forceRefresh && cachedSystemStatus && (now - lastStatusCheck) < STATUS_CACHE_TTL) {
    return cachedSystemStatus;
  }

  const templatePaths = [
    '/reports/referee_template_u9.pdf',
    '/reports/referee_template_u11.pdf',
    '/reports/referee_template_u13.pdf',
    '/reports/referee_template_u15.pdf',
  ];

  const fontPath = '/fonts/Roboto-Medium.ttf';

  // Check templates
  const templateStatuses = await Promise.all(
    templatePaths.map(async (path): Promise<TemplateStatus> => {
      try {
        const response = await env.ASSETS.fetch(new Request(`https://dummy.com${path}`));
        if (!response.ok) {
          return { path, exists: false, error: `HTTP ${response.status}` };
        }
        const buffer = await response.arrayBuffer();
        const hash = await computeHash(buffer);
        const expectedHash = KNOWN_GOOD_HASHES.templates[path as keyof typeof KNOWN_GOOD_HASHES.templates];
        const hashValid = hash === expectedHash;
        
        return {
          path,
          exists: true,
          hash,
          size: buffer.byteLength,
          hashValid,
          expectedHash,
        };
      } catch (error) {
        return {
          path,
          exists: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    })
  );

  // Check font
  let fontStatus: SystemStatus['font'];
  try {
    const response = await env.ASSETS.fetch(new Request(`https://dummy.com${fontPath}`));
    if (!response.ok) {
      fontStatus = { exists: false, error: `HTTP ${response.status}` };
    } else {
      const buffer = await response.arrayBuffer();
      const hash = await computeHash(buffer);
      const expectedHash = KNOWN_GOOD_HASHES.font;
      const hashValid = hash === expectedHash;
      
      fontStatus = {
        exists: true,
        hash,
        size: buffer.byteLength,
        hashValid,
        expectedHash,
      };
    }
  } catch (error) {
    fontStatus = {
      exists: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Determine overall status
  const issues: string[] = [];
  
  const allTemplatesExist = templateStatuses.every(t => t.exists);
  const fontExists = fontStatus.exists;
  
  if (!allTemplatesExist) {
    const missingTemplates = templateStatuses.filter(t => !t.exists).map(t => t.path);
    issues.push(`Missing templates: ${missingTemplates.join(', ')}`);
  }
  
  if (!fontExists) {
    issues.push('Font file missing');
  }
  
  // Check hash validity
  const invalidTemplateHashes = templateStatuses.filter(t => t.exists && t.hashValid === false);
  if (invalidTemplateHashes.length > 0) {
    issues.push(`Template hash mismatch: ${invalidTemplateHashes.map(t => t.path).join(', ')}`);
  }
  
  if (fontStatus.exists && fontStatus.hashValid === false) {
    issues.push('Font hash mismatch');
  }
  
  let overallStatus: SystemStatus['status'] = 'healthy';
  if (!allTemplatesExist || !fontExists) {
    overallStatus = 'unhealthy';
  } else if (invalidTemplateHashes.length > 0 || fontStatus.hashValid === false) {
    overallStatus = 'unhealthy';
  }

  // Run autotest
  let autotestResult: SystemStatus['autotest'];
  if (overallStatus === 'healthy') {
    autotestResult = await runAutotest(env);
    if (!autotestResult.passed) {
      overallStatus = 'degraded';
      issues.push('Autotest failed');
    }
  } else {
    issues.push('Autotest skipped due to missing or invalid files');
  }

  const status: SystemStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    templates: templateStatuses,
    font: fontStatus,
    autotest: autotestResult,
    issues: issues.length > 0 ? issues : undefined,
  };

  // Cache the status
  cachedSystemStatus = status;
  lastStatusCheck = now;

  return status;
}

async function computeHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

async function runAutotest(env: Env): Promise<SystemStatus['autotest']> {
  const startTime = Date.now();
  const errors: string[] = [];

  // Test data for each category
  const testCases: FormData[] = [
    {
      referee_name_1: 'Test Referee U9',
      match_date: '2024-01-15',
      starting_hour: '10:00',
      team_1: 'Team A',
      team_2: 'Team B',
      age_category: 'U9',
    },
    {
      referee_name_1: 'Test Referee 1',
      referee_name_2: 'Test Referee 2',
      match_date: '2024-01-15',
      starting_hour: '14:30',
      team_1: 'Team C',
      team_2: 'Team D',
      age_category: 'U11',
    },
    {
      referee_name_1: 'Test Referee 1',
      referee_name_2: 'Test Referee 2',
      match_date: '2024-01-15',
      starting_hour: '16:00',
      team_1: 'Team E',
      team_2: 'Team F',
      age_category: 'U13',
    },
    {
      referee_name_1: 'Test Main Referee',
      match_date: '2024-01-15',
      starting_hour: '18:00',
      team_1: 'Team G',
      team_2: 'Team H',
      age_category: 'U15',
      competition: 'Test Competition',
      assistant_referee_1: 'Assistant 1',
      assistant_referee_2: 'Assistant 2',
      fourth_official: 'Fourth Official',
      stadium_name: 'Test Stadium',
      stadium_locality: 'Test City',
    },
  ];

  // Run tests
  for (const testData of testCases) {
    try {
      const pdfBuffer = await generateReport(testData, env);
      
      // Validate PDF was generated
      if (!pdfBuffer || pdfBuffer.length === 0) {
        errors.push(`${testData.age_category}: Generated PDF is empty`);
        continue;
      }

      // Validate PDF format (basic check)
      const pdfHeader = String.fromCharCode(...Array.from(pdfBuffer.slice(0, 4)));
      if (pdfHeader !== '%PDF') {
        errors.push(`${testData.age_category}: Invalid PDF format`);
      }
    } catch (error) {
      errors.push(`${testData.age_category}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  const duration = Date.now() - startTime;

  return {
    passed: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    duration,
  };
}
