// Aviso da aba que perdeu o direito de editar o rascunho (ver state/draftCommit): daqui
// nada mais é salvo nem criado, e o conteúdo continua visível para a pessoa copiar.
import { Copy, ExternalLink, RotateCcw } from 'lucide-react';
import { Button, Callout, Textarea, useToast } from './ui';
import type { StaleReason } from '../state/draftCommit';
import { lazyLabels } from '../i18n';
import { useI18n } from '../i18n/I18nProvider';

const TITLE = lazyLabels<StaleReason>({
  criado_outra_aba: 'stale.title.created',
  divergente: 'stale.title.created',
  substituido: 'stale.title.taken',
  excluido: 'stale.title.deleted',
});

export function StaleDraftNotice({ reason, text, noun, onOpen, onNew }: { reason: StaleReason; text: string; noun: 'projeto' | 'processo'; onOpen?: () => void; onNew?: () => void }) {
  const toast = useToast();
  const { t } = useI18n();
  const nounText = t(noun === 'projeto' ? 'stale.noun.project' : 'stale.noun.process');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('ok', t('stale.copied'));
    } catch {
      toast('info', t('stale.copyFail'));
    }
  };
  return (
    <div data-testid="stale-draft">
      <Callout tone="warn" title={TITLE[reason]}>
        <p>
          {reason === 'excluido'
            ? t('stale.body.deleted', { noun: nounText })
            : t('stale.body.other', { noun: nounText })}{' '}
          {t('stale.body.keep')}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void copy()}>
            <Copy className="h-4 w-4" aria-hidden /> {t('stale.copy')}
          </Button>
          {onOpen && (
            <Button size="sm" variant="ghost" onClick={onOpen}>
              <ExternalLink className="h-4 w-4" aria-hidden /> {t('stale.open', { noun: nounText })}
            </Button>
          )}
          {onNew && (
            <Button size="sm" variant="ghost" onClick={onNew}>
              <RotateCcw className="h-4 w-4" aria-hidden /> {t('stale.new')}
            </Button>
          )}
        </div>
        <Textarea readOnly aria-label={t('stale.data')} className="mt-2 font-mono text-xs" rows={6} value={text} data-testid="stale-copy" />
      </Callout>
    </div>
  );
}
