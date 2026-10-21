// Limite de erro: uma falha de renderização mostra uma explicação e um caminho
// de volta, em vez de deixar a aplicação inteira em branco. Os dados não são apagados.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { SupportLink } from './SupportLink';

interface Props {
  children: ReactNode;
  /** Muda a chave para tentar de novo quando o usuário navega. */
  resetKey?: string;
}
interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Falha de renderização', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-xl space-y-4 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-bad" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold text-ink">Não foi possível mostrar esta tela</h2>
            <p className="mt-1 text-sm text-ink2">
              Seus dados continuam salvos neste aparelho. Volte à lista de projetos e tente abrir de novo. Se o problema continuar, faça um backup pela tela inicial e avise o suporte.
            </p>
            <p className="mt-1 text-sm text-ink2">
              <SupportLink prefix="Suporte:" />
            </p>
          </div>
        </div>
        <Link to="/app" className="inline-flex min-h-[44px] items-center font-semibold text-accent underline underline-offset-2">
          Voltar aos meus projetos
        </Link>
      </div>
    );
  }
}
