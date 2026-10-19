import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Histogram } from '../../components/charts';
import { Button, Callout, Card, Field, HowCalc, NumberInput, Select, Stat, Term } from '../../components/ui';
import { simulate, simulationReadiness, type SimulationResult } from '../../domain/advanced';
import { fmtHours } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';

export default function SimulationTab() {
  const { w } = useWorkspace();
  const [target, setTarget] = useState<'asis' | string>('asis');
  const proc = target === 'asis' ? w.asIs : (w.scenarios.find((s) => s.id === target)?.process ?? w.asIs);
  const ready = useMemo(() => simulationReadiness(proc), [proc]);
  const [iterations, setIterations] = useState(1500);
  const [res, setRes] = useState<SimulationResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = () => {
    setErr(null);
    try {
      setRes(simulate(proc, iterations));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha na simulação.');
    }
  };

  return (
    <div className="space-y-4">
      <Card title={<>Simulação de incerteza do prazo <Term k="montecarlo" iconOnly /></>} subtitle="Somente com dados válidos">
        <p className="text-sm text-ink2">
          Para cada atividade, sorteamos uma duração entre o <strong>mínimo</strong>, o <strong>mais provável</strong> (a duração informada) e o <strong>máximo</strong>, seguindo uma distribuição triangular. Repetimos {iterations.toLocaleString('pt-BR')} vezes e mostramos a faixa
          provável do tempo decorrido. É uma estimativa condicionada às premissas — não uma garantia de prazo.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="Processo">
            {(f) => (
              <Select
                {...f}
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setRes(null);
                }}
              >
                <option value="asis">AS-IS (hoje)</option>
                {w.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    TO-BE: {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Iterações" help="Padrão 1.500.">
            {(f) => <NumberInput {...f} value={iterations} onChange={(v) => v && setIterations(Math.min(20000, Math.max(100, Math.round(v))))} />}
          </Field>
          <Button onClick={run} disabled={!ready.ready}>
            <Play className="h-4 w-4" /> Simular
          </Button>
        </div>
        {!ready.ready && (
          <div className="mt-3">
            <Callout tone="warn" title="Faltam parâmetros para simular — nada foi estimado">
              <ul className="list-disc pl-4">
                {ready.missing.slice(0, 10).map((m) => (
                  <li key={m.id + m.reason}>
                    {m.name}: {m.reason}
                  </li>
                ))}
                {ready.missing.length > 10 && <li>… e mais {ready.missing.length - 10}</li>}
              </ul>
              <Link to={`/app/p/${w.id}/${target === 'asis' ? 'dados' : 'tobe'}`} className="font-semibold text-brand hover:underline">
                Informar mínimo e máximo
              </Link>
            </Callout>
          </div>
        )}
        {err && <Callout tone="bad">{err}</Callout>}
      </Card>
      {res && (
        <Card title="Resultado" subtitle={`${res.iterations.toLocaleString('pt-BR')} iterações · semente ${res.seed} (reproduzível)`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="P50 (mediana)" value={fmtHours(res.elapsed.p50)} sub="metade das simulações termina antes" basis="estimado" />
            <Stat label="P80" value={fmtHours(res.elapsed.p80)} sub="80% terminam até aqui" basis="estimado" />
            <Stat label="P90" value={fmtHours(res.elapsed.p90)} sub="prazo conservador" basis="estimado" />
            <Stat label="Valor determinístico" value={fmtHours(res.deterministicElapsedH)} sub="com as durações mais prováveis" basis="calculado" />
          </div>
          <div className="mt-4">
            <Histogram bins={res.histogram} markers={[{ label: 'P50', value: res.elapsed.p50 }, { label: 'P90', value: res.elapsed.p90 }]} />
          </div>
          <HowCalc>
            <p>Tempo decorrido de cada iteração = caminho mais longo (trabalho sorteado + esperas informadas), sem retrabalho. Decisões: considera o caminho mais longo (pior caso), pois não há probabilidade de ramo informada.</p>
            <p>Faixa de trabalho ativo por execução (ponderado por frequência): P10 {fmtHours(res.active.p10)} · P50 {fmtHours(res.active.p50)} · P90 {fmtHours(res.active.p90)}.</p>
            <p>Gerador pseudoaleatório com semente fixa: rodar de novo com os mesmos dados dá o mesmo resultado.</p>
          </HowCalc>
        </Card>
      )}
    </div>
  );
}
