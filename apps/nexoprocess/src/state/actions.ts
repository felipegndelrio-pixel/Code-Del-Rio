import { demoWorkspace } from '../domain/demo';
import { newWorkspace } from '../domain/factory';
import type { ProcessModel, Workspace } from '../domain/types';
import { db } from '../storage/db';
import { askPersistentStorage } from './install';

/** Abre o exemplo (reaproveita o existente para não duplicar). */
export async function openDemo(reset = false): Promise<Workspace> {
  const all = await db.listWorkspaces();
  const existing = all.find((w) => w.isDemo);
  if (existing && !reset) return existing;
  if (existing) await db.deleteWorkspace(existing.id);
  const w = demoWorkspace();
  await db.putWorkspace(w);
  return w;
}

export async function createWorkspace(p: ProcessModel, source: Workspace['source']): Promise<Workspace> {
  const w = newWorkspace(p, source, false);
  await db.putWorkspace(w);
  askPersistentStorage();
  return w;
}

type DownloadsNs = { save: (r: { filename: string; data: Blob }) => Promise<unknown> };
type ClaudeHost = { use?: (name: 'downloads') => Promise<DownloadsNs | null> };

/**
 * Entrega um arquivo ao viewer. Dentro de um artifact o navegador não baixa
 * diretamente, então usa a capacidade `downloads` (o viewer confirma o salvamento).
 * Fora dele, usa o download comum do navegador.
 */
export async function download(name: string, data: BlobPart, type: string) {
  const blob = new Blob([data], { type });
  const host = (globalThis as { claude?: ClaudeHost }).claude;
  const ns = host?.use ? await host.use('downloads') : null;
  if (ns) {
    try {
      await ns.save({ filename: name, data: blob });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      const msg =
        code === 'declined'
          ? 'o salvamento foi cancelado.'
          : code === 'too_large'
            ? 'o arquivo é grande demais para ser salvo nesta visualização.'
            : 'esta visualização não consegue salvar arquivos. Abra o projeto no app publicado.';
      throw new Error(msg, { cause: e });
    }
    return;
  }
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
  await download('modelo-nexoprocess.xlsx', await buildWorkbook({ includeExample: true }), XLSX_MIME);
}
export async function downloadTemplateCsv() {
  const { templateCsv } = await import('../io/workbook');
  await download('modelo-nexoprocess-exemplo.csv', templateCsv(), 'text/csv;charset=utf-8');
}

/**
 * Gera o arquivo do projeto (.nexoprocess.json, mesmo formato do backup) para
 * continuar em outro aparelho. Usa o compartilhamento nativo quando o navegador
 * aceita arquivos (iOS/Android); senão, baixa o arquivo.
 */
export async function shareProject(w: Workspace): Promise<'shared' | 'downloaded'> {
  const name = `${slug(w.asIs.name)}.nexoprocess.json`;
  const json = JSON.stringify({ format: 'nexoprocess-backup', version: 1, exportedAt: new Date().toISOString(), workspaces: [w] }, null, 2);
  const file = typeof File !== 'undefined' ? new File([json], name, { type: 'application/json' }) : null;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (file && nav.canShare?.({ files: [file] }) && nav.share) {
    await nav.share({ files: [file], title: w.asIs.name });
    return 'shared';
  }
  await download(name, json, 'application/json');
  return 'downloaded';
}
