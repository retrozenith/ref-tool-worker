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
  age_category: 'U9' | 'U11' | 'U13' | 'U15' | 'U16' | 'U17' | 'U17F' | 'U12' | 'U14' | 'LIGA2' | 'LIGA3' | 'LIGAT' | 'CN';
  locality: string;
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

// Supported localities (referee associations)
const SUPPORTED_LOCALITIES = ['Ilfov', 'frf'] as const;
type Locality = typeof SUPPORTED_LOCALITIES[number];

// Template mapping for each locality
const LOCALITY_TEMPLATES: Record<string, Record<string, string>> = {
  'Ilfov': {
    'U9': 'referee_template_u9.pdf',
    'U11': 'referee_template_u11.pdf',
    'U13': 'referee_template_u13.pdf',
    'U15': 'referee_template_u15.pdf',
  },
  'frf': {
    'U11': 'referee_template-Interliga-U11.pdf',
    'U12': 'referee_template-Interliga-U12.pdf',
    'U13': 'referee_template-liga-elitelor_U13.pdf',
    'U14': 'referee_template-liga-elitelor_U14.pdf',
    'U15': 'referee_template-liga-elitelor_U15.pdf',
    'U16': 'referee_template-liga-elitelor_U16.pdf',
    'U17': 'referee_template-liga-elitelor_U17.pdf',
    'U17F': 'referee_template-liga-elitelor_U17 feminin.pdf',
    'LIGA2': 'referee_template-liga-2.pdf',
    'LIGA3': 'referee_template-liga-3.pdf',
    'LIGAT': 'referee_template-liga-de-Tineret.pdf',
    'CN': 'referee_template-campionate-nationale.pdf',
  },
};

// Known good hashes for templates and font (baseline)
const KNOWN_GOOD_HASHES = {
  templates: {
    'Ilfov': {
      '/reports/Ilfov/referee_template_u9.pdf': '2c39f190ce628be33404bb62c8b272cba68a6924a2e876095d426da6f6680980',
      '/reports/Ilfov/referee_template_u11.pdf': '3996ff002d0c86c1e2902255c2fccf02c5538c0c6f72b9d3aba16f3fc56de925',
      '/reports/Ilfov/referee_template_u13.pdf': '2bce26208461dccb0a375847ecc8954df47ec9e98c2cca3de4533914a4a8b432',
      '/reports/Ilfov/referee_template_u15.pdf': 'bc99e407ff955a3c417596ed2fc2a1d3d69fc069693ce55f14e9d638c5e257d1',
    },
    'frf': {
      '/reports/frf/referee_template-Interliga-U11.pdf': '321860428eaf400994ecff761a3ab64ebb6595e35a32f2159f9119f0316789d8',
      '/reports/frf/referee_template-Interliga-U12.pdf': 'b4db5099c769ff153cb0499fe146838283272030047eaef30bf063de7c75f780',
      '/reports/frf/referee_template-liga-elitelor_U13.pdf': '307cc8ba5bd6cda083b3901a835808e321829a29bdbaab78045c9faba8041e6f',
      '/reports/frf/referee_template-liga-elitelor_U14.pdf': '98c1cac31adba46c5fdaed41860a7a5075179fd379af40adf12b18bedd9658ca',
      '/reports/frf/referee_template-liga-elitelor_U15.pdf': '1e217e3e65588032e4967066bce2d316a17d5c25054350a98b5118a9e4985845',
      '/reports/frf/referee_template-liga-elitelor_U16.pdf': '79dcb1827ba590522dab9fdbb3c37d1e34f0b614abcab21f297b5819e18b8556',
      '/reports/frf/referee_template-liga-elitelor_U17.pdf': '6849559d0b3793b67a6ace029b8f71508a0b56983ad8dbf6dfe9d69fa3a83a3c',
      '/reports/frf/referee_template-liga-elitelor_U17 feminin.pdf': 'a7acf455995e96920099b24a85a18ca523387878c60bb24282dd2e0354a07685',
      '/reports/frf/referee_template-liga-2.pdf': '6f06a1148741c47151feabed467b4c58680f46f226b50f0b50df7a15a7219b69',
      '/reports/frf/referee_template-liga-3.pdf': 'f0107dd39637f5ad88d06ee3d058f1f4dbec51d9bdd938344b9aae8a92063ec3',
      '/reports/frf/referee_template-liga-de-Tineret.pdf': '607a2abe1c5a80189437d874966d6140f39c042e5fe6ee7bf897b14bb3cb8eef',
      '/reports/frf/referee_template-campionate-nationale.pdf': '6f46471fb57f5567073b41ce1c42e71901d753f3b56c4eee5c6e8744e3642c05',
    },
  },
  font: '0de679de4d3d236c4a60e13bd2cd16d0f93368e9f6ba848385a8023c2e53c202',
};

// Coordinate configurations for different localities and categories
interface OverlayConfig {
  [key: string]: { x: number; y: number; page: number; field: keyof FormData | 'formatted_date' | 'match_vs' | 'locality_field' | 'refs'}[];
}

const OVERLAY_CONFIGS: Record<string, Record<string, OverlayConfig>> = {
  'Ilfov': {
    'U9': {
      overlays: [
        { x: 101, y: 687, page: 0, field: 'referee_name_1' },
        { x: 337, y: 686, page: 0, field: 'formatted_date' },
        { x: 101, y: 712, page: 0, field: 'match_vs' },
        { x: 101, y: 636, page: 0, field: 'team_1' },
        { x: 355, y: 636, page: 0, field: 'team_2' },
      ],
    },
    'U11': {
      overlays: [
        { x: 101, y: 687, page: 0, field: 'referee_name_1' },
        { x: 101, y: 662, page: 0, field: 'referee_name_2' },
        { x: 346, y: 686, page: 0, field: 'formatted_date' },
        { x: 335, y: 660, page: 0, field: 'starting_hour' },
        { x: 101, y: 712, page: 0, field: 'match_vs' },
        { x: 101, y: 636, page: 0, field: 'team_1' },
        { x: 355, y: 636, page: 0, field: 'team_2' },
      ],
    },
    'U13': {
      overlays: [
        { x: 101, y: 687, page: 0, field: 'referee_name_1' },
        { x: 101, y: 662, page: 0, field: 'referee_name_2' },
        { x: 346, y: 686, page: 0, field: 'formatted_date' },
        { x: 335, y: 660, page: 0, field: 'starting_hour' },
        { x: 101, y: 712, page: 0, field: 'match_vs' },
        { x: 101, y: 636, page: 0, field: 'team_1' },
        { x: 355, y: 636, page: 0, field: 'team_2' },
      ],
    },
    'U15': {
      overlays: [
        { x: 163, y: 353, page: 0, field: 'referee_name_1' },
        { x: 163, y: 338, page: 0, field: 'assistant_referee_1' },
        { x: 163, y: 321, page: 0, field: 'assistant_referee_2' },
        { x: 163, y: 305, page: 0, field: 'fourth_official' },
        { x: 490, y: 353, page: 0, field: 'locality_field' },
        { x: 490, y: 337, page: 0, field: 'locality_field' },
        { x: 490, y: 322, page: 0, field: 'locality_field' },
        { x: 490, y: 305, page: 0, field: 'locality_field' },
        { x: 390, y: 425, page: 0, field: 'formatted_date' },
        { x: 510, y: 425, page: 0, field: 'starting_hour' },
        { x: 110, y: 515, page: 0, field: 'match_vs' },
        { x: 110, y: 453, page: 0, field: 'competition' },
        { x: 150, y: 399, page: 0, field: 'stadium_name' },
        { x: 163, y: 426, page: 0, field: 'stadium_locality' },
        { x: 90, y: 78, page: 4, field: 'formatted_date' },
        { x: 150, y: 783, page: 5, field: 'team_1' },
        { x: 160, y: 783, page: 6, field: 'team_2' },
      ],
    },
  },
  'frf': {
    // FRF templates use similar U15 layout for most categories
    // These coordinates may need adjustment based on actual PDF layouts
    'U11': { overlays: [
      { x: 101, y: 687, page: 0, field: 'refs' },
    ],
   },
    'U12': { overlays: [] },
    'U13': { overlays: [
        { x: 101, y: 687, page: 0, field: 'referee_name_1' },
        { x: 101, y: 662, page: 0, field: 'referee_name_2' },
        { x: 346, y: 686, page: 0, field: 'formatted_date' },
        { x: 335, y: 660, page: 0, field: 'starting_hour' },
        { x: 101, y: 712, page: 0, field: 'match_vs' },
        { x: 101, y: 636, page: 0, field: 'team_1' },
        { x: 355, y: 636, page: 0, field: 'team_2' },
    ] },
    'U14': { overlays: [
        { x: 163, y: 359, page: 0, field: 'referee_name_1' },
        { x: 163, y: 343, page: 0, field: 'assistant_referee_1' },
        { x: 163, y: 327, page: 0, field: 'assistant_referee_2' },
        { x: 163, y: 310, page: 0, field: 'fourth_official' },
        { x: 490, y: 359, page: 0, field: 'locality_field' },
        { x: 490, y: 344, page: 0, field: 'locality_field' },
        { x: 490, y: 327, page: 0, field: 'locality_field' },
        { x: 490, y: 310, page: 0, field: 'locality_field' },
        { x: 390, y: 430, page: 0, field: 'formatted_date' },
        { x: 510, y: 430, page: 0, field: 'starting_hour' },
        { x: 110, y: 520, page: 0, field: 'match_vs' },
        { x: 110, y: 458, page: 0, field: 'competition' },
        { x: 150, y: 402, page: 0, field: 'stadium_name' },
        { x: 163, y: 430, page: 0, field: 'stadium_locality' },
        { x: 90, y: 78, page: 4, field: 'formatted_date' },
        { x: 150, y: 783, page: 5, field: 'team_1' },
        { x: 160, y: 783, page: 6, field: 'team_2' },
    ],
   },
    'U15': { overlays: [
        { x: 163, y: 359, page: 0, field: 'referee_name_1' },
        { x: 163, y: 343, page: 0, field: 'assistant_referee_1' },
        { x: 163, y: 327, page: 0, field: 'assistant_referee_2' },
        { x: 163, y: 310, page: 0, field: 'fourth_official' },
        { x: 490, y: 359, page: 0, field: 'locality_field' },
        { x: 490, y: 344, page: 0, field: 'locality_field' },
        { x: 490, y: 327, page: 0, field: 'locality_field' },
        { x: 490, y: 310, page: 0, field: 'locality_field' },
        { x: 390, y: 430, page: 0, field: 'formatted_date' },
        { x: 510, y: 430, page: 0, field: 'starting_hour' },
        { x: 110, y: 520, page: 0, field: 'match_vs' },
        { x: 110, y: 458, page: 0, field: 'competition' },
        { x: 150, y: 402, page: 0, field: 'stadium_name' },
        { x: 163, y: 430, page: 0, field: 'stadium_locality' },
        { x: 90, y: 78, page: 4, field: 'formatted_date' },
        { x: 150, y: 783, page: 5, field: 'team_1' },
        { x: 160, y: 783, page: 6, field: 'team_2' },
    ],
   },
    'U16': { overlays: [
        { x: 163, y: 353, page: 0, field: 'referee_name_1' },
        { x: 163, y: 338, page: 0, field: 'assistant_referee_1' },
        { x: 163, y: 321, page: 0, field: 'assistant_referee_2' },
        { x: 163, y: 305, page: 0, field: 'fourth_official' },
        { x: 490, y: 353, page: 0, field: 'locality_field' },
        { x: 490, y: 337, page: 0, field: 'locality_field' },
        { x: 490, y: 322, page: 0, field: 'locality_field' },
        { x: 490, y: 305, page: 0, field: 'locality_field' },
        { x: 390, y: 425, page: 0, field: 'formatted_date' },
        { x: 510, y: 425, page: 0, field: 'starting_hour' },
        { x: 110, y: 515, page: 0, field: 'match_vs' },
        { x: 110, y: 453, page: 0, field: 'competition' },
        { x: 150, y: 399, page: 0, field: 'stadium_name' },
        { x: 163, y: 426, page: 0, field: 'stadium_locality' },
        { x: 90, y: 78, page: 4, field: 'formatted_date' },
        { x: 150, y: 783, page: 5, field: 'team_1' },
        { x: 160, y: 783, page: 6, field: 'team_2' },
    ],
   },
    'U17': { overlays: [
        { x: 163, y: 353, page: 0, field: 'referee_name_1' },
        { x: 163, y: 338, page: 0, field: 'assistant_referee_1' },
        { x: 163, y: 321, page: 0, field: 'assistant_referee_2' },
        { x: 163, y: 305, page: 0, field: 'fourth_official' },
        { x: 490, y: 353, page: 0, field: 'locality_field' },
        { x: 490, y: 337, page: 0, field: 'locality_field' },
        { x: 490, y: 322, page: 0, field: 'locality_field' },
        { x: 490, y: 305, page: 0, field: 'locality_field' },
        { x: 390, y: 425, page: 0, field: 'formatted_date' },
        { x: 510, y: 425, page: 0, field: 'starting_hour' },
        { x: 110, y: 515, page: 0, field: 'match_vs' },
        { x: 110, y: 453, page: 0, field: 'competition' },
        { x: 150, y: 399, page: 0, field: 'stadium_name' },
        { x: 163, y: 426, page: 0, field: 'stadium_locality' },
        { x: 90, y: 78, page: 4, field: 'formatted_date' },
        { x: 150, y: 783, page: 5, field: 'team_1' },
        { x: 160, y: 783, page: 6, field: 'team_2' },
    ],
   },
    'U17F': { overlays: [
        { x: 163, y: 353, page: 0, field: 'referee_name_1' },
        { x: 163, y: 338, page: 0, field: 'assistant_referee_1' },
        { x: 163, y: 321, page: 0, field: 'assistant_referee_2' },
        { x: 163, y: 305, page: 0, field: 'fourth_official' },
        { x: 490, y: 353, page: 0, field: 'locality_field' },
        { x: 490, y: 337, page: 0, field: 'locality_field' },
        { x: 490, y: 322, page: 0, field: 'locality_field' },
        { x: 490, y: 305, page: 0, field: 'locality_field' },
        { x: 390, y: 425, page: 0, field: 'formatted_date' },
        { x: 510, y: 425, page: 0, field: 'starting_hour' },
        { x: 110, y: 515, page: 0, field: 'match_vs' },
        { x: 110, y: 453, page: 0, field: 'competition' },
        { x: 150, y: 399, page: 0, field: 'stadium_name' },
        { x: 163, y: 426, page: 0, field: 'stadium_locality' },
        { x: 90, y: 78, page: 4, field: 'formatted_date' },
        { x: 150, y: 783, page: 5, field: 'team_1' },
        { x: 160, y: 783, page: 6, field: 'team_2' },
    ],
   },
    'LIGA2': { overlays: [
        { x: 163, y: 353, page: 0, field: 'referee_name_1' },
        { x: 163, y: 338, page: 0, field: 'assistant_referee_1' },
        { x: 163, y: 321, page: 0, field: 'assistant_referee_2' },
        { x: 163, y: 305, page: 0, field: 'fourth_official' },
        { x: 490, y: 353, page: 0, field: 'locality_field' },
        { x: 490, y: 337, page: 0, field: 'locality_field' },
        { x: 490, y: 322, page: 0, field: 'locality_field' },
        { x: 490, y: 305, page: 0, field: 'locality_field' },
        { x: 390, y: 425, page: 0, field: 'formatted_date' },
        { x: 510, y: 425, page: 0, field: 'starting_hour' },
        { x: 110, y: 515, page: 0, field: 'match_vs' },
        { x: 110, y: 453, page: 0, field: 'competition' },
        { x: 150, y: 399, page: 0, field: 'stadium_name' },
        { x: 163, y: 426, page: 0, field: 'stadium_locality' },
        { x: 90, y: 78, page: 4, field: 'formatted_date' },
        { x: 150, y: 783, page: 5, field: 'team_1' },
        { x: 160, y: 783, page: 6, field: 'team_2' },
    ],
   },
    'LIGA3': { overlays: [
        { x: 163, y: 353, page: 0, field: 'referee_name_1' },
        { x: 163, y: 338, page: 0, field: 'assistant_referee_1' },
        { x: 163, y: 321, page: 0, field: 'assistant_referee_2' },
        { x: 163, y: 305, page: 0, field: 'fourth_official' },
        { x: 490, y: 353, page: 0, field: 'locality_field' },
        { x: 490, y: 337, page: 0, field: 'locality_field' },
        { x: 490, y: 322, page: 0, field: 'locality_field' },
        { x: 490, y: 305, page: 0, field: 'locality_field' },
        { x: 390, y: 425, page: 0, field: 'formatted_date' },
        { x: 510, y: 425, page: 0, field: 'starting_hour' },
        { x: 110, y: 515, page: 0, field: 'match_vs' },
        { x: 110, y: 453, page: 0, field: 'competition' },
        { x: 150, y: 399, page: 0, field: 'stadium_name' },
        { x: 163, y: 426, page: 0, field: 'stadium_locality' },
        { x: 90, y: 78, page: 4, field: 'formatted_date' },
        { x: 150, y: 783, page: 5, field: 'team_1' },
        { x: 160, y: 783, page: 6, field: 'team_2' },
    ],
  },
    'LIGAT': { overlays: [
        { x: 163, y: 353, page: 0, field: 'referee_name_1' },
        { x: 163, y: 338, page: 0, field: 'assistant_referee_1' },
        { x: 163, y: 321, page: 0, field: 'assistant_referee_2' },
        { x: 163, y: 305, page: 0, field: 'fourth_official' },
        { x: 490, y: 353, page: 0, field: 'locality_field' },
        { x: 490, y: 337, page: 0, field: 'locality_field' },
        { x: 490, y: 322, page: 0, field: 'locality_field' },
        { x: 490, y: 305, page: 0, field: 'locality_field' },
        { x: 390, y: 425, page: 0, field: 'formatted_date' },
        { x: 510, y: 425, page: 0, field: 'starting_hour' },
        { x: 110, y: 515, page: 0, field: 'match_vs' },
        { x: 110, y: 453, page: 0, field: 'competition' },
        { x: 150, y: 399, page: 0, field: 'stadium_name' },
        { x: 163, y: 426, page: 0, field: 'stadium_locality' },
        { x: 90, y: 78, page: 4, field: 'formatted_date' },
        { x: 150, y: 783, page: 5, field: 'team_1' },
        { x: 160, y: 783, page: 6, field: 'team_2' },
    ],
   },
    'CN': { overlays: [
        { x: 163, y: 353, page: 0, field: 'referee_name_1' },
        { x: 163, y: 338, page: 0, field: 'assistant_referee_1' },
        { x: 163, y: 321, page: 0, field: 'assistant_referee_2' },
        { x: 163, y: 305, page: 0, field: 'fourth_official' },
        { x: 490, y: 353, page: 0, field: 'locality_field' },
        { x: 490, y: 337, page: 0, field: 'locality_field' },
        { x: 490, y: 322, page: 0, field: 'locality_field' },
        { x: 490, y: 305, page: 0, field: 'locality_field' },
        { x: 390, y: 425, page: 0, field: 'formatted_date' },
        { x: 510, y: 425, page: 0, field: 'starting_hour' },
        { x: 110, y: 515, page: 0, field: 'match_vs' },
        { x: 110, y: 453, page: 0, field: 'competition' },
        { x: 150, y: 399, page: 0, field: 'stadium_name' },
        { x: 163, y: 426, page: 0, field: 'stadium_locality' },
        { x: 90, y: 78, page: 4, field: 'formatted_date' },
        { x: 150, y: 783, page: 5, field: 'team_1' },
        { x: 160, y: 783, page: 6, field: 'team_2' },
    ],
   },
  },
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowedOrigins = [
      'https://ref-tool-frontend.pages.dev',
      'https://rapoarte.cristeavictor.xyz',
      'http://localhost:4321', // Local development
      'http://localhost:8787', // Wrangler dev
    ];
    
    const origin = request.headers.get('Origin') || '';
    
    // Check if origin is allowed
    // Support exact matches, Cloudflare Pages preview deployments, and cristeavictor.xyz subdomains
    const isAllowed = allowedOrigins.includes(origin) || 
                      (origin.endsWith('.ref-tool-frontend.pages.dev') && origin.startsWith('https://')) ||
                      (origin.endsWith('.pages.dev') && origin.includes('ref-tool-frontend')) ||
                      (origin.endsWith('.cristeavictor.xyz') && origin.startsWith('https://')) ||
                      origin === 'https://cristeavictor.xyz';
    
    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // Only set Access-Control-Allow-Origin if origin is in allowed list
    if (isAllowed) {
      corsHeaders['Access-Control-Allow-Origin'] = origin;
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        headers: isAllowed ? corsHeaders : { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
      });
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
      // Build supported categories per locality
      const supportedByLocality: Record<string, string[]> = {};
      for (const locality of SUPPORTED_LOCALITIES) {
        supportedByLocality[locality] = Object.keys(LOCALITY_TEMPLATES[locality] || {});
      }

      return new Response(JSON.stringify({
        message: 'PDF Generator API',
        endpoint: 'POST /api/generate-report',
        status_endpoint: 'GET /api/status (includes template hash check and autotest)',
        supported_localities: SUPPORTED_LOCALITIES,
        supported_by_locality: supportedByLocality,
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
  const required = ['referee_name_1', 'match_date', 'starting_hour', 'team_1', 'team_2', 'age_category', 'locality'];

  for (const field of required) {
    if (!formData[field as keyof FormData] || formData[field as keyof FormData]?.toString().trim() === '') {
      return `Missing required field: ${field}`;
    }
  }

  const validCategories = ['U9', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U17F', 'LIGA2', 'LIGA3', 'LIGAT', 'CN'];
  if (!validCategories.includes(formData.age_category)) {
    return `Invalid age category. Must be one of: ${validCategories.join(', ')}`;
  }

  if (!SUPPORTED_LOCALITIES.includes(formData.locality as Locality)) {
    return `Invalid locality. Must be one of: ${SUPPORTED_LOCALITIES.join(', ')}`;
  }

  // Validate that the locality supports this age category
  const localityTemplates = LOCALITY_TEMPLATES[formData.locality];
  if (!localityTemplates || !localityTemplates[formData.age_category]) {
    const supportedCategories = localityTemplates ? Object.keys(localityTemplates).join(', ') : 'none';
    return `Age category ${formData.age_category} is not supported for locality ${formData.locality}. Supported categories: ${supportedCategories}`;
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
  const templateFilename = LOCALITY_TEMPLATES[formData.locality]?.[formData.age_category];
  if (!templateFilename) {
    throw new Error(`No template found for ${formData.locality}/${formData.age_category}`);
  }
  
  const templatePath = `/reports/${formData.locality}/${templateFilename}`;
  const overlays = getOverlays(formData);

  return await applyOverlays(templatePath, overlays, env);
}

function getOverlays(formData: FormData): TextOverlay[] {
  const config = OVERLAY_CONFIGS[formData.locality]?.[formData.age_category];
  
  if (!config || !config.overlays || config.overlays.length === 0) {
    // Fallback to legacy method for backward compatibility or unimplemented configs
    return getLegacyOverlays(formData);
  }

  const overlays: TextOverlay[] = [];
  
  for (const item of config.overlays) {
    let text = '';
    
    switch (item.field) {
      case 'formatted_date':
        text = formatDate(formData.match_date, formData.age_category);
        break;
      case 'match_vs':
        text = `${formData.team_1} - ${formData.team_2}`;
        break;
      case 'locality_field':
        text = formData.locality;
        break;
      case 'referee_name_1':
      case 'referee_name_2':
      case 'refs':
        text = `${formData.referee_name_1}  ${formData.referee_name_2}`;
        break;
      case 'assistant_referee_1':
      case 'assistant_referee_2':
      case 'fourth_official':
      case 'team_1':
      case 'team_2':
      case 'starting_hour':
      case 'competition':
      case 'stadium_name':
      case 'stadium_locality':
        text = formData[item.field] || '';
        break;
    }
    
    if (text) {
      overlays.push({
        text,
        x: item.x,
        y: item.y,
        page: item.page,
      });
    }
  }
  
  return overlays;
}

function getLegacyOverlays(formData: FormData): TextOverlay[] {
  // Legacy fallback for categories not yet configured
  switch (formData.age_category) {
    case 'U9':
      return getU9Overlays(formData);
    case 'U11':
    case 'U13':
      return getU11U13Overlays(formData);
    case 'U15':
      return getU15Overlays(formData);
    default:
      return [];
  }
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
    { text: formData.locality, x: 490, y: 353, page: 0 },
    { text: formData.locality, x: 490, y: 337, page: 0 },
    { text: formData.locality, x: 490, y: 322, page: 0 },
    { text: formData.locality, x: 490, y: 305, page: 0 }
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

  // Build template paths for all localities
  const templatePaths: string[] = [];
  for (const locality of SUPPORTED_LOCALITIES) {
    const localityTemplates = LOCALITY_TEMPLATES[locality];
    if (localityTemplates) {
      for (const [category, filename] of Object.entries(localityTemplates)) {
        templatePaths.push(`/reports/${locality}/${filename}`);
      }
    }
  }

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
        
        // Find the expected hash for this path
        let expectedHash: string | undefined;
        for (const locality of SUPPORTED_LOCALITIES) {
          const localityHashes = KNOWN_GOOD_HASHES.templates[locality];
          if (localityHashes && path in localityHashes) {
            expectedHash = localityHashes[path as keyof typeof localityHashes];
            break;
          }
        }
        
        const hashValid = expectedHash ? hash === expectedHash : undefined;
        
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

  // Test data for each category and locality
  const testCasesPerLocality: { [key: string]: FormData[] } = {
    'Ilfov': [
      {
        referee_name_1: 'Test Referee U9',
        match_date: '2024-01-15',
        starting_hour: '10:00',
        team_1: 'Team A',
        team_2: 'Team B',
        age_category: 'U9',
        locality: 'Ilfov',
      },
      {
        referee_name_1: 'Test Referee 1',
        referee_name_2: 'Test Referee 2',
        match_date: '2024-01-15',
        starting_hour: '14:30',
        team_1: 'Team C',
        team_2: 'Team D',
        age_category: 'U11',
        locality: 'Ilfov',
      },
      {
        referee_name_1: 'Test Referee 1',
        referee_name_2: 'Test Referee 2',
        match_date: '2024-01-15',
        starting_hour: '16:00',
        team_1: 'Team E',
        team_2: 'Team F',
        age_category: 'U13',
        locality: 'Ilfov',
      },
      {
        referee_name_1: 'Test Main Referee',
        match_date: '2024-01-15',
        starting_hour: '18:00',
        team_1: 'Team G',
        team_2: 'Team H',
        age_category: 'U15',
        locality: 'Ilfov',
        competition: 'Test Competition',
        assistant_referee_1: 'Assistant 1',
        assistant_referee_2: 'Assistant 2',
        fourth_official: 'Fourth Official',
        stadium_name: 'Test Stadium',
        stadium_locality: 'Test City',
      },
    ],
    'frf': [
      {
        referee_name_1: 'Test Referee',
        match_date: '2024-01-15',
        starting_hour: '10:00',
        team_1: 'Team A',
        team_2: 'Team B',
        age_category: 'U15',
        locality: 'frf',
        competition: 'Test Liga',
        assistant_referee_1: 'AR1',
        assistant_referee_2: 'AR2',
        fourth_official: 'FO',
        stadium_name: 'Test Stadium',
        stadium_locality: 'Test City',
      },
      {
        referee_name_1: 'Test Referee Liga 2',
        match_date: '2024-01-15',
        starting_hour: '14:00',
        team_1: 'Team C',
        team_2: 'Team D',
        age_category: 'LIGA2',
        locality: 'frf',
        competition: 'Liga 2',
        assistant_referee_1: 'AR1',
        assistant_referee_2: 'AR2',
        fourth_official: 'FO',
        stadium_name: 'Test Stadium',
        stadium_locality: 'Test City',
      },
    ],
  };

  // Run tests for all localities
  for (const locality of SUPPORTED_LOCALITIES) {
    const testCases = testCasesPerLocality[locality];
    if (!testCases) continue;

    for (const testData of testCases) {
      try {
        const pdfBuffer = await generateReport(testData, env);
        
        // Validate PDF was generated
        if (!pdfBuffer || pdfBuffer.length === 0) {
          errors.push(`${locality}/${testData.age_category}: Generated PDF is empty`);
          continue;
        }

        // Validate PDF format (basic check)
        const pdfHeader = String.fromCharCode(...Array.from(pdfBuffer.slice(0, 4)));
        if (pdfHeader !== '%PDF') {
          errors.push(`${locality}/${testData.age_category}: Invalid PDF format`);
        }
      } catch (error) {
        errors.push(`${locality}/${testData.age_category}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  const duration = Date.now() - startTime;

  return {
    passed: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    duration,
  };
}
