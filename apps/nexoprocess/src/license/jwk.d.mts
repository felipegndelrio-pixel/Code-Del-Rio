export function parseJwkText(raw: unknown, opts?: { lenientQuotes?: boolean }): { jwk: any; error: string | null };
export function jwkProblems(jwk: unknown, kind: 'public' | 'private'): string[];
export function jwkImportProblem(jwk: any, kind: 'public' | 'private'): Promise<string | null>;
export function jwkFingerprint(jwk: Record<string, any>): Promise<string>;
export function privateJwkProblem(jwk: any): Promise<string | null>;
