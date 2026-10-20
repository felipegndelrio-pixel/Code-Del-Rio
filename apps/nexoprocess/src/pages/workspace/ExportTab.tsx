import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileCode2, FileImage, FileSpreadsheet, FileText, FileJson } from 'lucide-react';
import { Button, Callout, Card, Field, Select, useToast } from '../../components/ui';
import { buildBpmn } from '../../bpmn/model';
import type { ProcessModel } from '../../domain/types';
import { download, slug, XLSX_MIME } from '../../state/actions';
import { useWorkspace } from '../../state/workspace';

export default function ExportTab() {
  const { w } = useWorkspace();
  const nav = useNavigate();
  const toast = useToast();
  const [which, setWhich] = useState<'asis' | string>('asis');
  const [busy, setBusy] = useState<string | null>(null);
  const proc: ProcessModel = which === 'asis' ? w.asIs : (w.scenarios.find((s) => s.id === which)?.process ?? w.asIs);
  const label = which === 'asis' ? 'as-is' : `to-be-${slug(w.scenarios.find((s) => s.id === which)?.name ?? '')}`;
  const base = `${slug(w.asIs.name)}-${label}`;

  const run = async (key: string, fn: () => Promise<void> | void) => {
    setBusy(key);
    try {
      await fn();
      toast('ok', 'Pronto! Arquivo gerado.');
    } catch (e) {
      toast('bad', `Não conseguimos exportar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const bpmnXml = () => run('xml', () => download(`${base}.bpmn`, buildBpmn(proc).xml, 'application/xml'));
  const images = (fmt: 'svg' | 'png') =>
    run(fmt, async () => {
      const b = buildBpmn(proc);
      const { renderAllSvgs, svgToPng } = await import('../../bpmn/render');
      const svgs = await renderAllSvgs(b.xml, [{ id: '', label: 'macro' }, ...b.stages.map((s) => ({ id: s.owner, label: s.stage! }))], 'light');
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      let i = 0;
      for (const s of svgs) {
        const name = `${String(i++).padStart(2, '0')}-${slug(s.label)}`;
        if (fmt === 'svg') zip.file(`${name}.svg`, s.svg);
        else zip.file(`${name}.png`, await svgToPng(s.svg, '#ffffff'));
      }
      await download(`${base}-mapas-${fmt}.zip`, await zip.generateAsync({ type: 'uint8array' }) as Uint8Array<ArrayBuffer>, 'application/zip');
    });
  const xlsx = () =>
    run('xlsx', async () => {
      const { buildWorkbook } = await import('../../io/workbook');
      await download(`${base}.xlsx`, await buildWorkbook({ process: proc, includeExample: false }), XLSX_MIME);
    });
  const csv = () =>
    run('csv', async () => {
      const { processToCsv } = await import('../../io/workbook');
      await download(`${base}.csv`, processToCsv(proc), 'text/csv;charset=utf-8');
    });
  const json = () => run('json', () => download(`${slug(w.asIs.name)}-backup.json`, JSON.stringify({ format: 'nexoprocess-backup', version: 1, exportedAt: new Date().toISOString(), workspaces: [w] }, null, 2), 'application/json'));

  return (
    <div className="space-y-4">
      <Card title="Exportar" subtitle="Arquivos gerados no seu aparelho">
        <Field label="O que exportar" className="max-w-sm">
          {(f) => (
            <Select {...f} value={which} onChange={(e) => setWhich(e.target.value)}>
              <option value="asis">AS-IS (processo atual)</option>
              {w.scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  TO-BE: {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ExportBtn icon={<FileCode2 />} title="BPMN 2.0 XML" text="Abre em ferramentas compatíveis (ex.: bpmn.io, Camunda Modeler)." onClick={bpmnXml} busy={busy === 'xml'} />
          <ExportBtn icon={<FileImage />} title="Mapas em SVG (ZIP)" text="Visão macro + uma imagem por etapa, vetorial." onClick={() => images('svg')} busy={busy === 'svg'} />
          <ExportBtn icon={<FileImage />} title="Mapas em PNG (ZIP)" text="Mesmas imagens em PNG de alta resolução." onClick={() => images('png')} busy={busy === 'png'} />
          <ExportBtn icon={<FileSpreadsheet />} title="Dados em XLSX" text="Mesmo formato do modelo oficial — pode ser reimportado." onClick={xlsx} busy={busy === 'xlsx'} />
          <ExportBtn icon={<FileSpreadsheet />} title="Dados em CSV" text="Separador “;” e vírgula decimal (Excel pt-BR)." onClick={csv} busy={busy === 'csv'} />
          <ExportBtn icon={<FileJson />} title="Backup deste processo" text="JSON completo (AS-IS, cenários, plano, resultados)." onClick={json} busy={busy === 'json'} />
        </div>
      </Card>
      <Card title="Relatório executivo" subtitle="PDF pela impressão do navegador">
        <p className="text-sm text-ink2">Resumo, indicadores, mapa, gargalos, recomendações, comparação AS-IS × TO-BE, business case, premissas, riscos, plano de ação e resultados — com a distinção entre informado, calculado, estimado, a validar e realizado.</p>
        <Button className="mt-3" onClick={() => nav(`/app/p/${w.id}/relatorio`)}>
          <FileText className="h-4 w-4" /> Abrir relatório
        </Button>
      </Card>
      <Callout tone="info">
        O XML segue a estrutura BPMN 2.0 (validado pelo metamodelo do bpmn-moddle nos testes). Junções paralelas não são inferidas automaticamente; os dados originais ficam preservados no XLSX.
      </Callout>
    </div>
  );
}

function ExportBtn({ icon, title, text, onClick, busy }: { icon: React.ReactNode; title: string; text: string; onClick: () => void; busy: boolean }) {
  return (
    <div className="flex flex-col rounded-xl border border-line/15 bg-surface2/40 p-4">
      <div className="text-brand [&>svg]:h-6 [&>svg]:w-6">{icon}</div>
      <p className="mt-2 font-semibold text-ink">{title}</p>
      <p className="flex-1 text-xs text-ink2">{text}</p>
      <Button className="mt-3" size="sm" variant="secondary" onClick={onClick} loading={busy}>
        Baixar
      </Button>
    </div>
  );
}
