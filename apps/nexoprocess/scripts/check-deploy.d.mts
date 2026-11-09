export function publicKeysFromBundle(js: string): { keys: JsonWebKey[]; smartQuotes: boolean; invalid: string[] };
export function checkDeploy(baseUrl: string, log?: (line: string) => void): Promise<number>;
