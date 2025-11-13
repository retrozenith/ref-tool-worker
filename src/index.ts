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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        message: 'PDF Generator API',
        endpoint: 'POST /api/generate-report',
        supported_categories: ['U9', 'U11', 'U13', 'U15'],
        status: 'healthy'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
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
              'Access-Control-Allow-Origin': '*',
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
            'Access-Control-Allow-Origin': '*',
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
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }

    return new Response('Not Found', {
      status: 404,
      headers: { 'Access-Control-Allow-Origin': '*' },
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
