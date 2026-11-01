export const MARKERS: Record<string, string>;
export function injectHtml(html: string, env: Record<string, string | undefined>, opts: { sale: boolean; file?: string }): { html: string; errors: string[] };
export function injectDist(distDir: string, env: Record<string, string | undefined>, opts: { sale: boolean }): string[];
export function draftPages(siteDir: string): string[];
