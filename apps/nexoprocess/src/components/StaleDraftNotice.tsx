// Aviso da aba que perdeu o direito de editar o rascunho (ver state/draftCommit): daqui
// nada mais é salvo nem criado, e o conteúdo continua visível para a pessoa copiar.
import { Copy, ExternalLink, RotateCcw } from 'lucide-react';
import { Button, Callout, Textarea, useToast } from './ui';
import type { StaleReason } from '../state/draftCommit';

const TITLE: Record<StaleReason, string> = {
  criado_outra_aba: 'Projeto criado em outra aba. Copie seus dados.',
  divergente: 'Projeto criado em outra aba. Copie seus dados.',
  substituido: 'Este rascunho foi assumido por outra aba. Copie seus dados.',
  excluido: 'Este rascunho já virou um projeto, que foi excluído depois. Copie seus dados.',
};

export function StaleDraftNotice({ reason, text, noun, onOpen, onNew }: { reason: StaleReason; text: string; noun: 'projeto' | 'processo'; onOpen?: () => void; onNew?: () => void }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('ok', 'Dados copiados.');
    } catch {
      toast('info', 'Não deu para copiar automaticamente: selecione o texto do quadro e copie.');
    }
  };
  return (
    <div data-testid="stale-draft">
      <Callout tone="warn" title={TITLE[reason]}>
        <p>
          {reason === 'excluido'
            ? `Para não recriar um ${noun} excluído sem você pedir, esta aba parou de salvar e não cria outro ${noun}.`
            : `Para não sobrescrever nada, esta aba parou de salvar e não cria outro ${noun}.`}{' '}
          Suas respostas continuam na tela; copie o que precisar.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void copy()}>
            <Copy className="h-4 w-4" aria-hidden /> Copiar meus dados
          </Button>
          {onOpen && (
            <Button size="sm" variant="ghost" onClick={onOpen}>
              <ExternalLink className="h-4 w-4" aria-hidden /> Abrir o {noun} criado
            </Button>
          )}
          {onNew && (
            <Button size="sm" variant="ghost" onClick={onNew}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Começar um rascunho novo
            </Button>
          )}
        </div>
        <Textarea readOnly aria-label="Seus dados deste rascunho" className="mt-2 font-mono text-xs" rows={6} value={text} data-testid="stale-copy" />
      </Callout>
    </div>
  );
}
