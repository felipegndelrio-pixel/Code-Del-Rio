// Termos técnicos explicados em linguagem simples (ajuda contextual).
// Os textos vêm do dicionário no idioma ativo (getters).
import { tr } from '../i18n';

interface GlossaryEntry {
  readonly term: string;
  readonly text: string;
}
export type GlossaryKey = 'bpmn' | 'lean' | 'va' | 'nnva' | 'waste' | 'lead' | 'active' | 'effort' | 'rework' | 'bottleneck' | 'raci' | 'fmea' | 'asis' | 'tobe' | 'payback' | 'roi' | 'pareto' | 'yamazumi' | 'montecarlo' | 'capacity';

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  bpmn: {
    get term() {
      return tr('d.gl.bpmn.term');
    },
    get text() {
      return tr('d.gl.bpmn.text');
    },
  },
  lean: {
    get term() {
      return tr('d.gl.lean.term');
    },
    get text() {
      return tr('d.gl.lean.text');
    },
  },
  va: {
    get term() {
      return tr('d.gl.va.term');
    },
    get text() {
      return tr('d.gl.va.text');
    },
  },
  nnva: {
    get term() {
      return tr('d.gl.nnva.term');
    },
    get text() {
      return tr('d.gl.nnva.text');
    },
  },
  waste: {
    get term() {
      return tr('d.gl.waste.term');
    },
    get text() {
      return tr('d.gl.waste.text');
    },
  },
  lead: {
    get term() {
      return tr('d.gl.lead.term');
    },
    get text() {
      return tr('d.gl.lead.text');
    },
  },
  active: {
    get term() {
      return tr('d.gl.active.term');
    },
    get text() {
      return tr('d.gl.active.text');
    },
  },
  effort: {
    get term() {
      return tr('d.gl.effort.term');
    },
    get text() {
      return tr('d.gl.effort.text');
    },
  },
  rework: {
    get term() {
      return tr('d.gl.rework.term');
    },
    get text() {
      return tr('d.gl.rework.text');
    },
  },
  bottleneck: {
    get term() {
      return tr('d.gl.bottleneck.term');
    },
    get text() {
      return tr('d.gl.bottleneck.text');
    },
  },
  raci: {
    get term() {
      return tr('d.gl.raci.term');
    },
    get text() {
      return tr('d.gl.raci.text');
    },
  },
  fmea: {
    get term() {
      return tr('d.gl.fmea.term');
    },
    get text() {
      return tr('d.gl.fmea.text');
    },
  },
  asis: {
    get term() {
      return tr('d.gl.asis.term');
    },
    get text() {
      return tr('d.gl.asis.text');
    },
  },
  tobe: {
    get term() {
      return tr('d.gl.tobe.term');
    },
    get text() {
      return tr('d.gl.tobe.text');
    },
  },
  payback: {
    get term() {
      return tr('d.gl.payback.term');
    },
    get text() {
      return tr('d.gl.payback.text');
    },
  },
  roi: {
    get term() {
      return tr('d.gl.roi.term');
    },
    get text() {
      return tr('d.gl.roi.text');
    },
  },
  pareto: {
    get term() {
      return tr('d.gl.pareto.term');
    },
    get text() {
      return tr('d.gl.pareto.text');
    },
  },
  yamazumi: {
    get term() {
      return tr('d.gl.yamazumi.term');
    },
    get text() {
      return tr('d.gl.yamazumi.text');
    },
  },
  montecarlo: {
    get term() {
      return tr('d.gl.montecarlo.term');
    },
    get text() {
      return tr('d.gl.montecarlo.text');
    },
  },
  capacity: {
    get term() {
      return tr('d.gl.capacity.term');
    },
    get text() {
      return tr('d.gl.capacity.text');
    },
  },
};
