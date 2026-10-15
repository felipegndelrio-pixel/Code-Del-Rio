import { useRef, useState } from 'react';
import { Download, Paperclip, Trash2 } from 'lucide-react';
import { useProject } from '../ProjectDetail';
import { supabase } from '../../lib/supabase';
import { deleteDocument, documentDownloadUrl, fetchAll, uploadDocument } from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import { ACCEPT_ATTR, formatBytes } from '../../lib/files';
import type { DocumentRow } from '../../lib/types';
import { Button, ConfirmDialog, EmptyState, ErrorBox, Spinner, fmtDate, useToast } from '../../components/ui';

const ENTITY_LABEL: Record<string, string> = {
  project: 'Projeto',
  action: 'Ação',
  risk: 'Risco',
  issue: 'Problema',
  decision: 'Decisão',
  change_request: 'Mudança',
  milestone: 'Marco',
  status_report: 'Relatório',
};

export default function DocumentsPanel({ entityType, entityId, showAll }: { entityType: string; entityId: string | null; showAll?: boolean }) {
  const { project, canContribute, canManage, me, personName } = useProject();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<DocumentRow | null>(null);
  const { data, error, loading, reload } = useAsync(
    () =>
      fetchAll<DocumentRow>(supabase, 'documents', {
        projectIds: [project.id],
        order: 'created_at',
        ascending: false,
        eq: showAll ? {} : entityId ? { entity_type: entityType, entity_id: entityId } : { entity_type: entityType },
      }),
    [project.id, entityType, entityId, showAll],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">Armazenamento privado · PDF, imagens, Office, CSV/TXT · até 20 MB · links de download expiram em 60 s.</p>
        {canContribute && (
          <>
            <input
              ref={input}
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              aria-label="Selecionar arquivo"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy(true);
                try {
                  await uploadDocument(supabase, { projectId: project.id, entityType, entityId, file });
                  toast('ok', 'Arquivo anexado');
                  reload();
                } catch (err) {
                  toast('error', (err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
            <Button variant="secondary" loading={busy} onClick={() => input.current?.click()}>
              <Paperclip className="h-4 w-4" /> Anexar
            </Button>
          </>
        )}
      </div>
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState title="Nenhum documento" />
      ) : (
        <ul className="divide-y divide-navy-700 rounded-xl border border-navy-700">
          {data.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate text-white">{d.file_name}</p>
                <p className="text-[11px] text-slate-500">
                  {showAll && `${ENTITY_LABEL[d.entity_type] ?? d.entity_type} · `}
                  {formatBytes(d.size_bytes)} · {personName(d.uploaded_by)} · {fmtDate(d.created_at)}
                </p>
              </div>
              <button
                className="rounded p-2 text-teal-200 hover:bg-navy-800"
                aria-label={`Baixar ${d.file_name}`}
                onClick={async () => {
                  try {
                    window.location.assign(await documentDownloadUrl(supabase, d));
                  } catch (err) {
                    toast('error', (err as Error).message);
                  }
                }}
              >
                <Download className="h-4 w-4" />
              </button>
              {(canManage || (canContribute && d.uploaded_by === me)) && (
                <button className="rounded p-2 text-red-300 hover:bg-red-950" aria-label={`Excluir ${d.file_name}`} onClick={() => setDel(d)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!del}
        danger
        title="Excluir documento"
        message={`Excluir "${del?.file_name}"? O arquivo será removido do armazenamento; a exclusão fica registrada na auditoria.`}
        confirmLabel="Excluir"
        onCancel={() => setDel(null)}
        onConfirm={async () => {
          try {
            await deleteDocument(supabase, del!);
            toast('ok', 'Documento excluído');
            setDel(null);
            reload();
          } catch (err) {
            toast('error', (err as Error).message);
          }
        }}
      />
    </div>
  );
}
