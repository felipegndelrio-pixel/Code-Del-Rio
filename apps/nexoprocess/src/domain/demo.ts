// Processo demonstrativo FICTÍCIO. Os números são ilustrativos, não
// representam nenhuma empresa real e ficam isolados (workspace.isDemo = true).
import { newActivity, newProcess } from './factory';
import type { Activity, ProcessModel } from './types';

export const DEMO_NAME = 'Processamento de pedido (exemplo fictício)';

export function demoProcess(): ProcessModel {
  const p = newProcess(DEMO_NAME);
  p.description = 'Do recebimento do pedido ao despacho. Dados ilustrativos para conhecer a ferramenta.';
  p.area = 'Operações (exemplo)';
  p.processOwner = 'Gerente de operações (exemplo)';
  p.volume = 1200;
  p.volumePeriod = 'mes';
  p.hoursPerDay = 8;
  p.costPerHourByRole = {
    Atendente: 45,
    'Analista financeiro': 70,
    'Operador de estoque': 38,
    Conferente: 40,
    Faturista: 50,
    'Analista de logística': 60,
  };
  let order = 0;
  const A = (x: Partial<Activity> & Pick<Activity, 'id' | 'stage' | 'name'>) => newActivity({ order: ++order, ...x });
  p.activities = [
    A({ id: 'S0', stage: 'Recebimento', name: 'Pedido recebido', type: 'start', next: ['A1'] }),
    A({ id: 'A1', stage: 'Recebimento', name: 'Registrar pedido no sistema', duration: 10, people: 1, owner: 'Atendente', lean: 'NNVA', wait: 30, minDuration: 6, maxDuration: 20, next: ['A2'] }),
    A({ id: 'A2', stage: 'Recebimento', name: 'Conferir dados do cliente', duration: 8, people: 1, owner: 'Atendente', lean: 'NNVA', minDuration: 5, maxDuration: 15, next: ['D1'] }),
    A({ id: 'D1', stage: 'Recebimento', name: 'Dados completos?', type: 'decision', nextYes: 'B1', nextNo: 'A3' }),
    A({ id: 'A3', stage: 'Recebimento', name: 'Solicitar correção ao cliente', duration: 15, people: 1, owner: 'Atendente', lean: 'W', rework: true, frequencyPct: 20, wait: 240, minDuration: 10, maxDuration: 30, next: ['A2'], notes: 'Cliente responde por e-mail; espera média informada pela equipe (exemplo).' }),
    A({ id: 'B1', stage: 'Análise de crédito', name: 'Consultar limite de crédito', duration: 12, people: 1, owner: 'Analista financeiro', lean: 'NNVA', wait: 120, minDuration: 8, maxDuration: 25, next: ['D2'], critical: true }),
    A({ id: 'D2', stage: 'Análise de crédito', name: 'Crédito aprovado?', type: 'decision', nextYes: 'C1', nextNo: 'B2' }),
    A({ id: 'B2', stage: 'Análise de crédito', name: 'Análise manual de crédito', duration: 45, people: 2, owner: 'Analista financeiro', lean: 'NNVA', frequencyPct: 15, wait: 480, minDuration: 30, maxDuration: 90, next: ['D3'], critical: true }),
    A({ id: 'D3', stage: 'Análise de crédito', name: 'Aprovado na análise manual?', type: 'decision', nextYes: 'C1', nextNo: 'X1' }),
    A({ id: 'X1', stage: 'Análise de crédito', name: 'Pedido recusado', type: 'end' }),
    A({ id: 'C1', stage: 'Separação', name: 'Separar itens no estoque', duration: 35, people: 2, owner: 'Operador de estoque', lean: 'VA', wait: 60, minDuration: 20, maxDuration: 60, next: ['C2'] }),
    A({ id: 'C2', stage: 'Separação', name: 'Conferir itens separados', duration: 15, people: 1, owner: 'Conferente', lean: 'NNVA', minDuration: 10, maxDuration: 25, next: ['D4'] }),
    A({ id: 'D4', stage: 'Separação', name: 'Itens corretos?', type: 'decision', nextYes: 'C4', nextNo: 'C3' }),
    A({ id: 'C3', stage: 'Separação', name: 'Refazer separação', duration: 20, people: 1, owner: 'Operador de estoque', lean: 'W', rework: true, frequencyPct: 10, minDuration: 10, maxDuration: 40, next: ['C2'] }),
    A({ id: 'C4', stage: 'Separação', name: 'Embalar pedido', duration: 12, people: 1, owner: 'Operador de estoque', lean: 'VA', minDuration: 8, maxDuration: 20, next: ['E1'] }),
    A({ id: 'E1', stage: 'Expedição', name: 'Emitir nota fiscal', duration: 6, people: 1, owner: 'Faturista', lean: 'NNVA', wait: 90, minDuration: 4, maxDuration: 12, next: ['E2'] }),
    A({ id: 'E2', stage: 'Expedição', name: 'Agendar transporte', duration: 10, people: 1, owner: 'Analista de logística', lean: 'NNVA', wait: 240, minDuration: 5, maxDuration: 20, next: ['E3'] }),
    A({ id: 'E3', stage: 'Expedição', name: 'Despachar pedido', duration: 15, people: 2, owner: 'Operador de estoque', lean: 'VA', minDuration: 10, maxDuration: 30, next: ['F1'] }),
    A({ id: 'F1', stage: 'Expedição', name: 'Pedido despachado', type: 'end' }),
  ];
  p.stageOrder = ['Recebimento', 'Análise de crédito', 'Separação', 'Expedição'];
  return p;
}
