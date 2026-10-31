import { describe, expect, it } from 'vitest';
import { fmtBRL, fmtDate, fmtDateTime, fmtNum, fmtPct } from '../domain/units';
import { dictionaries, formatters, htmlLang, interpolate, LOCALE_STORAGE_KEY, parseLocale, resolveLocale, translate, type LocaleStorage } from './index';
import { en } from './messages/en';
import { pt, type MessageKey } from './messages/pt';

const mem = (init: Record<string, string> = {}) => {
  const data = new Map(Object.entries(init));
  const s: LocaleStorage & { data: Map<string, string> } = {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
  return s;
};
const broken: LocaleStorage = {
  getItem: () => {
    throw new Error('bloqueado');
  },
  setItem: () => {
    throw new Error('bloqueado');
  },
};

describe('escolha de idioma', () => {
  it('padrão é PT, sem consultar o idioma do navegador', () => {
    expect(resolveLocale('', mem())).toBe('pt');
    expect(resolveLocale('', null)).toBe('pt');
  });
  it('?lang=en escolhe EN e salva a preferência', () => {
    const s = mem();
    expect(resolveLocale('?lang=en', s)).toBe('en');
    expect(s.data.get(LOCALE_STORAGE_KEY)).toBe('en');
    expect(resolveLocale('', s)).toBe('en'); // visita seguinte, sem parâmetro
  });
  it('?lang=pt volta para PT e salva', () => {
    const s = mem({ [LOCALE_STORAGE_KEY]: 'en' });
    expect(resolveLocale('?lang=pt-BR', s)).toBe('pt');
    expect(s.data.get(LOCALE_STORAGE_KEY)).toBe('pt');
  });
  it('valor inválido no parâmetro ou salvo cai no padrão e não grava', () => {
    const s = mem({ [LOCALE_STORAGE_KEY]: 'fr' });
    expect(resolveLocale('?lang=xx', s)).toBe('pt');
    expect(s.data.get(LOCALE_STORAGE_KEY)).toBe('fr');
  });
  it('armazenamento bloqueado não quebra', () => {
    expect(resolveLocale('?lang=en', broken)).toBe('en');
    expect(resolveLocale('', broken)).toBe('pt');
  });
  it('parseLocale aceita variantes regionais e rejeita o resto', () => {
    expect(parseLocale('EN-us')).toBe('en');
    expect(parseLocale('pt_BR')).toBe('pt');
    expect(parseLocale('es')).toBeNull();
    expect(parseLocale(undefined)).toBeNull();
  });
  it('chave da preferência fica fora do prefixo "nexo." apagado por clearAll', () => {
    expect(LOCALE_STORAGE_KEY.startsWith('nexo.')).toBe(false);
  });
  it('<html lang> do PT continua pt-BR', () => {
    expect(htmlLang('pt')).toBe('pt-BR');
    expect(htmlLang('en')).toBe('en');
  });
});

describe('dicionário', () => {
  const keys = Object.keys(pt) as MessageKey[];
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it('EN tem exatamente as chaves do PT', () => {
    expect(Object.keys(en).sort()).toEqual([...keys].sort());
  });
  it('nenhum texto vazio e mesmas variáveis {x} nos dois idiomas', () => {
    for (const k of keys) {
      expect(pt[k].trim(), k).not.toBe('');
      expect(en[k].trim(), k).not.toBe('');
      expect(vars(en[k]), k).toEqual(vars(pt[k]));
    }
  });
  it('translate PT devolve o texto literal do PT', () => {
    for (const k of keys) expect(translate('pt', k)).toBe(pt[k]);
    expect(dictionaries.pt).toBe(pt);
  });
  it('interpolate troca {x} e mantém variável ausente visível', () => {
    expect(interpolate('Olá, {nome}! {n} itens', { nome: 'Ana', n: 3 })).toBe('Olá, Ana! 3 itens');
    expect(interpolate('Falta {x}', {})).toBe('Falta {x}');
    expect(interpolate('Sem vars')).toBe('Sem vars');
  });
});

describe('formatadores', () => {
  const nums = [0, 0.005, 1.234, 9.999, 10, 12.34, 99.95, 100, 1234.5, -1234.5, 1_000_000, -0.5];
  const f = formatters('pt');

  it('PT reproduz domain/units.ts exatamente', () => {
    for (const v of [...nums, null, undefined, NaN, Infinity]) {
      expect(f.number(v as number), String(v)).toBe(fmtNum(v as number));
      expect(f.number(v as number, 3), String(v)).toBe(fmtNum(v as number, 3));
      expect(f.percent(v as number), String(v)).toBe(fmtPct(v as number));
      expect(f.percent(v as number, 1), String(v)).toBe(fmtPct(v as number, 1));
      expect(f.currency(v as number), String(v)).toBe(fmtBRL(v as number));
    }
    for (const iso of ['2026-11-06', '2026-11-06T22:00:00-03:00', '2026-01-31T12:00:00Z', 'lixo', '', undefined]) {
      expect(f.date(iso), String(iso)).toBe(fmtDate(iso));
      expect(f.dateTime(iso), String(iso)).toBe(fmtDateTime(iso));
    }
  });

  it('EN usa en-US e USD', () => {
    const e = formatters('en');
    expect(e.number(1234.5)).toBe('1,235');
    expect(e.number(1.234)).toBe('1.23');
    expect(e.percent(12.5, 1)).toBe('12.5%');
    expect(e.currency(39)).toBe('$39.00');
    expect(e.currency(1500)).toBe('$1,500');
    expect(e.date('2026-11-06')).toBe('11/06/2026');
    expect(e.date(undefined)).toBe('—');
  });

  it('PT: moeda em BRL e data dd/mm/aaaa', () => {
    expect(f.currency(39)).toBe(fmtBRL(39));
    expect(f.currency(39)).toMatch(/^R\$\s39,00$/);
    expect(f.date('2026-11-06')).toBe('06/11/2026');
  });
});
