// Validação do processo antes de calcular. Erros impedem a análise; alertas
// não impedem, mas limitam conclusões. Correções automáticas são sempre
// SUGERIDAS (com rótulo) e só aplicadas após confirmação do usuário.
import { buildGraph, sortedActivities } from './graph';
import type { Activity, ProcessModel } from './types';
import { isNum } from './units';

export type Severity = 'error' | 'warning' | 'info';
export interface Issue {
  id: string;
  severity: Severity;
  code: string;
  message: string;
  why: string;
  fix: string;
  activityId?: string;
  row?: number;
  autofix?: { label: string; apply: (p: ProcessModel) => ProcessModel };
}

const clone = (p: ProcessModel): ProcessModel => structuredClone(p);
const where = (a: Activity) => (a.sourceRow ? ` (linha ${a.sourceRow})` : '');

export function validateProcess(p: ProcessModel): Issue[] {
  const issues: Issue[] = [];
  const push = (i: Omit<Issue, 'id'>) => issues.push({ ...i, id: `${i.code}:${i.activityId ?? ''}:${issues.length}` });

  if (!p.activities.length) {
    push({ severity: 'error', code: 'empty', message: 'O processo não tem atividades.', why: 'Sem atividades não há mapa nem análise.', fix: 'Adicione pelo menos uma atividade.' });
    return issues;
  }
  if (!isNum(p.hoursPerDay) || p.hoursPerDay <= 0 || p.hoursPerDay > 24)
    push({ severity: 'error', code: 'hours_per_day', message: 'Horas de trabalho por dia inválidas.', why: 'É a premissa usada para converter dias em horas.', fix: 'Informe um valor entre 1 e 24 (ex.: 8).' });
  if (isNum(p.volume) && p.volume < 0)
    push({ severity: 'error', code: 'volume_negative', message: 'Volume de execuções negativo.', why: 'Volume negativo não tem significado.', fix: 'Informe zero ou um valor positivo.' });

  // IDs duplicados
  const seen = new Map<string, Activity>();
  for (const a of p.activities) {
    if (seen.has(a.id))
      push({
        severity: 'error',
        code: 'duplicate_id',
        activityId: a.id,
        row: a.sourceRow,
        message: `O código "${a.id}" aparece mais de uma vez${where(a)}.`,
        why: 'As ligações entre atividades usam o código; duplicados tornam o fluxo ambíguo.',
        fix: 'Dê um código único para cada atividade.',
      });
    else seen.set(a.id, a);
  }

  const ordered = sortedActivities(p);
  for (const a of p.activities) {
    if (!a.name?.trim())
      push({ severity: 'error', code: 'no_name', activityId: a.id, row: a.sourceRow, message: `Atividade sem nome${where(a)}.`, why: 'O nome aparece no mapa e no relatório.', fix: 'Escreva o que acontece nessa atividade.' });
    if (!a.stage?.trim())
      push({ severity: 'warning', code: 'no_stage', activityId: a.id, row: a.sourceRow, message: `"${a.name}" não tem etapa macro${where(a)}.`, why: 'A etapa agrupa atividades na visão macro.', fix: 'Informe a etapa (ex.: "Recebimento").' });
    for (const [field, label] of [
      ['duration', 'Duração'],
      ['wait', 'Tempo de espera'],
      ['minDuration', 'Duração mínima'],
      ['maxDuration', 'Duração máxima'],
      ['people', 'Quantidade de pessoas'],
      ['costPerHour', 'Custo-hora'],
      ['variableCost', 'Custo variável'],
      ['volume', 'Volume'],
    ] as const) {
      const v = a[field];
      if (v !== undefined && (!isNum(v) || v < 0))
        push({
          severity: 'error',
          code: `invalid_${field}`,
          activityId: a.id,
          row: a.sourceRow,
          message: `${label} inválido(a) em "${a.name}"${where(a)}.`,
          why: 'Valores não numéricos ou negativos distorcem os cálculos.',
          fix: 'Use apenas números positivos (ex.: 30 ou 1,5).',
        });
    }
    if (isNum(a.frequencyPct) && (a.frequencyPct < 0 || a.frequencyPct > 100))
      push({ severity: 'error', code: 'invalid_frequency', activityId: a.id, row: a.sourceRow, message: `Frequência fora de 0–100% em "${a.name}"${where(a)}.`, why: 'Frequência é o percentual de execuções que passam pela atividade.', fix: 'Informe um percentual entre 0 e 100.' });
    if (a.type === 'task' && !isNum(a.duration))
      push({ severity: 'warning', code: 'no_duration', activityId: a.id, row: a.sourceRow, message: `"${a.name}" está sem duração${where(a)}.`, why: 'Sem duração, tempo, esforço e gargalos ficam incompletos.', fix: 'Informe o tempo estimado de trabalho.' });
    if (a.type === 'task' && isNum(a.people) && a.people === 0)
      push({ severity: 'warning', code: 'zero_people', activityId: a.id, row: a.sourceRow, message: `"${a.name}" tem 0 pessoas${where(a)}.`, why: 'Atividade sem pessoas resulta em esforço zero — correto apenas se for 100% automática.', fix: 'Confirme ou informe quantas pessoas executam.' });
    if (isNum(a.duration) && ((isNum(a.minDuration) && a.minDuration > a.duration) || (isNum(a.maxDuration) && a.maxDuration < a.duration)))
      push({ severity: 'warning', code: 'min_max', activityId: a.id, row: a.sourceRow, message: `Mínimo/máximo incoerentes com a duração em "${a.name}"${where(a)}.`, why: 'A simulação exige mínimo ≤ mais provável ≤ máximo.', fix: 'Ajuste os valores mínimo e máximo.' });
    if (a.type === 'decision') {
      const paths = [a.nextYes, a.nextNo, ...a.next].filter(Boolean);
      if (!paths.length)
        push({ severity: 'error', code: 'decision_no_path', activityId: a.id, row: a.sourceRow, message: `A decisão "${a.name}" não tem caminhos${where(a)}.`, why: 'Uma decisão precisa indicar para onde segue em cada resposta.', fix: 'Preencha "próxima se sim" e "próxima se não".' });
      else if (!a.nextYes || !a.nextNo)
        push({ severity: 'warning', code: 'decision_one_path', activityId: a.id, row: a.sourceRow, message: `A decisão "${a.name}" tem só um caminho${where(a)}.`, why: 'Decisões normalmente têm ao menos duas saídas.', fix: 'Complete o caminho que falta ou transforme em atividade.' });
    }
  }

  const g = buildGraph(p);
  for (const d of g.dangling) {
    const a = g.byId.get(d.from)!;
    push({
      severity: 'error',
      code: 'dangling',
      activityId: a.id,
      row: a.sourceRow,
      message: `"${a.name}" aponta para "${d.to}", que não existe${where(a)}.`,
      why: 'Ligações para atividades inexistentes quebram o fluxo.',
      fix: 'Corrija o código da próxima atividade ou remova a ligação.',
      autofix: {
        label: `Remover a ligação para "${d.to}"`,
        apply: (pp) => {
          const c = clone(pp);
          const x = c.activities.find((y) => y.id === a.id)!;
          x.next = x.next.filter((n) => n !== d.to);
          if (x.nextYes === d.to) x.nextYes = undefined;
          if (x.nextNo === d.to) x.nextNo = undefined;
          return c;
        },
      },
    });
  }
  for (const id of g.unreachable) {
    const a = g.byId.get(id)!;
    push({ severity: 'warning', code: 'unreachable', activityId: id, row: a.sourceRow, message: `"${a.name}" não é alcançada a partir do início${where(a)}.`, why: 'Atividades soltas não entram no tempo decorrido.', fix: 'Ligue uma atividade anterior a ela.' });
  }
  // Atividades que terminam o fluxo sem ser "fim"
  const idx = new Map(ordered.map((a, i) => [a.id, i]));
  for (const a of ordered) {
    if (a.type === 'end' || a.type === 'decision') continue;
    if (g.out.get(a.id)!.length > 0) continue;
    const hasEnd = ordered.some((x) => x.type === 'end');
    const nextByOrder = ordered[idx.get(a.id)! + 1];
    if (!hasEnd && !nextByOrder) continue; // último elemento: fim implícito
    push({
      severity: 'warning',
      code: 'dead_end',
      activityId: a.id,
      row: a.sourceRow,
      message: `"${a.name}" não indica a próxima atividade${where(a)}.`,
      why: 'O fluxo termina aqui; se não for o fim do processo, o mapa e o tempo decorrido ficam incorretos.',
      fix: 'Informe a próxima atividade, ou confirme que o processo termina aqui.',
      autofix: nextByOrder
        ? {
            label: `Ligar a "${nextByOrder.name}" (próxima pela ordem)`,
            apply: (pp) => {
              const c = clone(pp);
              c.activities.find((y) => y.id === a.id)!.next = [nextByOrder.id];
              return c;
            },
          }
        : undefined,
    });
  }
  // Ciclo sem decisão: nenhum nó do ciclo (de v até u pelo fluxo de avanço) é uma decisão.
  const cycleHasDecision = (from: string, to: string) => {
    const fwd = new Set<string>([to]);
    const q = [to];
    while (q.length) {
      const id = q.shift()!;
      for (const x of g.out.get(id)!)
        if (!x.back && !fwd.has(x.to)) {
          fwd.add(x.to);
          q.push(x.to);
        }
    }
    const rev = new Set<string>([from]);
    const r = [from];
    while (r.length) {
      const id = r.shift()!;
      for (const x of g.inc.get(id)!)
        if (!x.back && !rev.has(x.from)) {
          rev.add(x.from);
          r.push(x.from);
        }
    }
    return [...fwd].some((id) => rev.has(id) && g.byId.get(id)!.type === 'decision');
  };
  for (const e of g.backEdges) {
    const a = g.byId.get(e.from)!;
    if (e.kind === 'seq' && !cycleHasDecision(e.from, e.to))
      push({ severity: 'warning', code: 'loop_no_decision', activityId: a.id, row: a.sourceRow, message: `Retorno sem decisão de "${a.name}" para "${g.byId.get(e.to)!.name}".`, why: 'Um retorno incondicional cria um ciclo sem saída.', fix: 'Use uma decisão (ex.: "Aprovado?") para controlar o retorno.' });
  }
  if (!p.activities.some((a) => a.type === 'start'))
    push({ severity: 'info', code: 'no_start', message: 'Nenhum evento de início informado.', why: 'O mapa mostra um início implícito antes da primeira atividade.', fix: 'Opcional: adicione uma linha do tipo "início".' });
  if (!p.activities.some((a) => a.type === 'end'))
    push({ severity: 'info', code: 'no_end', message: 'Nenhum evento de fim informado.', why: 'O mapa mostra um fim implícito após as últimas atividades.', fix: 'Opcional: adicione uma linha do tipo "fim".' });
  const inferred = p.activities.filter((a) => a.flowInferred).length;
  if (inferred)
    push({ severity: 'info', code: 'flow_inferred', message: `${inferred} conexão(ões) foram inferidas pela ordem das linhas.`, why: 'A planilha não tinha coluna de próxima atividade; o fluxo foi montado em sequência.', fix: 'Revise o mapa; ajuste conexões na edição de dados se houver decisões ou paralelos.' });
  return issues;
}

export function blockingErrors(issues: Issue[]) {
  return issues.filter((i) => i.severity === 'error');
}
