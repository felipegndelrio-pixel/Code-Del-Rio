// English (en-US) copy for the international launch — DRAFT, not wired into the app yet.
// Mirrors src/config/brand.ts (pt-BR is the source of truth). "NexoProcess" is still a codename:
// confirm trademark and domain before release (see docs/COMERCIALIZACAO.md).
import { BRAND } from '../brand';

export const BRAND_EN = {
  ...BRAND,
  tagline:
    'Turn a simple spreadsheet into a visual process map, spot bottlenecks and get a practical improvement plan — no BPMN or Lean expertise required.',
} as const;

// Never add prices, testimonials or unverified numbers here.
export const COMMERCIAL_EN = {
  primaryCta: 'Get started',
  secondaryCta: { label: 'Talk to us', url: '' as string },
  contactEmail: '' as string,
} as const;

export const LANDING_EN = {
  heroTitle: 'From spreadsheet process to improvement plan.',
  heroSubtitle: BRAND_EN.tagline,
  steps: [
    {
      title: 'Describe the process',
      text: 'Answer a few simple questions or import your spreadsheet (XLSX or CSV). No BPMN knowledge needed.',
    },
    {
      title: 'See the map and the diagnosis',
      text: 'The flow is drawn automatically. Time, effort, waste and bottlenecks show up with the calculation rule in plain sight.',
    },
    {
      title: 'Plan and measure the improvement',
      text: 'Build the future state, compare it with today, generate the action plan and record the actual results.',
    },
  ],
  features: [
    { title: 'Navigable map', text: 'Macro view by stage; click to open activities, decisions and rework.' },
    { title: 'Transparent Lean diagnosis', text: 'Value-added, necessary and waste, with an explicit calculation basis.' },
    { title: 'Traceable recommendations', text: 'Every suggestion shows the evidence, the rule behind it and the hypothesis to validate.' },
    { title: 'Current × Future', text: 'Compare time, effort, cost and capacity. An estimate never becomes "realized savings".' },
    { title: 'Executive report', text: 'PDF via the browser print dialog, BPMN 2.0 XML, SVG/PNG, XLSX and CSV.' },
    { title: 'Your data stays on your device', text: 'Spreadsheets are read in the browser. Nothing is sent to a server by default.' },
  ],
} as const;
