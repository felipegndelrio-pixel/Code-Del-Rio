export const MARKERS: Record<string, string>;
export function injectHtml(html: string, env: Record<string, string | undefined>, opts: { sale: boolean; file?: string }): { html: string; errors: string[] };
export function injectDist(distDir: string, env: Record<string, string | undefined>, opts: { sale: boolean }): string[];
export function draftPages(siteDir: string): string[];
export const LICENSE_OFFLINE_DAYS: number;
export const CF_BEACON: { script: string; connect: string };
export const CF_SNIPPET_MARKER: string;
export const LEGAL_FILES: string[];
export function parseLegal(md: string): { status: string; body: string };
export function isLegalDraft(md: string): boolean;
export function legalGate(dir: string): string[];
export function toLf(text: string): string;
export function deployFilesProblems(headers: string | undefined, redirects: string | undefined): string[];
export function assertDeployFiles(distDir: string): void;
export interface PaddleConfig { enabled: boolean; partial: boolean; problems: string[]; token: string; env: string; price: string; frame: string[]; connect: string[]; style: string[] }
export function paddleConfig(env: Record<string, string | undefined>): PaddleConfig;
export function patchHeaders(text: string, cfg: PaddleConfig): string;
