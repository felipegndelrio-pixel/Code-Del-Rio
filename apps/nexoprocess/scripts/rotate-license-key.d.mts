export interface RunResult { status: number; stdout: string; stderr: string }
export function realRun(cmd: string, args: string[], input: string): RunResult;
export function dpapiCommand(fp: string, stamp: string): { cmd: string; args: string[] };
export function rotateLicenseKey(opts?: {
  project?: string;
  backup?: boolean;
  run?: (cmd: string, args: string[], input: string) => RunResult;
  platform?: string;
  now?: () => Date;
  log?: (line: string) => void;
  out?: (line: string) => void;
  generate?: (() => Promise<CryptoKeyPair>) | null;
}): Promise<number>;
