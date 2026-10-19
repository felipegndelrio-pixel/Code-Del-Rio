import { demoProcess, demoScenario } from '../domain/demo';
import { newWorkspace } from '../domain/factory';
import type { ProcessModel, Workspace } from '../domain/types';
import { db } from '../storage/db';

/** Abre o exemplo (reaproveita o existente para não duplicar). */
export async function openDemo(reset = false): Promise<Workspace> {
  const all = await db.listWorkspaces();
  const existing = all.find((w) => w.isDemo);
  if (existing && !reset) return existing;
  if (existing) await db.deleteWorkspace(existing.id);
  const w = newWorkspace(demoProcess(), { kind: 'demo' }, true);
  const sc = demoScenario(w.asIs);
  w.scenarios = [sc];
  w.activeScenarioId = sc.id;
  await db.putWorkspace(w);
  return w;
}

export async function createWorkspace(p: ProcessModel, source: Workspace['source']): Promise<Workspace> {
  const w = newWorkspace(p, source, false);
  await db.putWorkspace(w);
  return w;
}

export function download(name: string, data: BlobPart, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slug(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'processo'
  );
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function downloadTemplateXlsx() {
  const { buildWorkbook } = await import('../io/workbook');
  download('modelo-nexoprocess.xlsx', await buildWorkbook({ includeExample: true }), XLSX_MIME);
}
export async function downloadTemplateCsv() {
  const { templateCsv } = await import('../io/workbook');
  download('modelo-nexoprocess-exemplo.csv', templateCsv(), 'text/csv;charset=utf-8');
}
