import { Card } from '../components/ui';

export default function Help() {
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="headline text-2xl font-extrabold">Ajuda</h1>
      <Card subtitle="Aplicativo" title="Instalar na tela inicial (PWA)">
        <div className="grid gap-4 text-sm text-slate-300 sm:grid-cols-2">
          <div>
            <p className="mb-1 font-semibold text-white">iPhone / iPad (Safari)</p>
            <ol className="list-inside list-decimal space-y-1">
              <li>Abra o endereço da plataforma no <b>Safari</b>.</li>
              <li>Toque em <b>Compartilhar</b> (quadrado com seta).</li>
              <li>Escolha <b>Adicionar à Tela de Início</b> e confirme.</li>
              <li>Abra pelo ícone “Projetos”.</li>
            </ol>
          </div>
          <div>
            <p className="mb-1 font-semibold text-white">Android (Chrome / Edge)</p>
            <ol className="list-inside list-decimal space-y-1">
              <li>Abra o endereço no Chrome.</li>
              <li>Toque no menu <b>⋮</b>.</li>
              <li>Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
            </ol>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Não é um aplicativo de loja (App Store / Google Play). Dados não ficam disponíveis offline: apenas a interface é armazenada em cache; consultas e gravações exigem
          internet e autenticação.
        </p>
      </Card>
      <Card subtitle="Transparência" title="Como os indicadores são calculados">
        <ul className="list-inside list-disc space-y-1.5 text-sm text-slate-300">
          <li><b>Avanço físico</b>: média ponderada pelo peso das folhas da EAP; sem EAP, média do % das ações não canceladas; sem ações, % manual. Sem dados, exibe “—”.</li>
          <li><b>Avanço planejado</b> (na data): interpolação linear entre início e fim planejados de cada item (EAP ou ação), ponderada igual ao físico.</li>
          <li><b>EV</b> = orçamento (BAC) × avanço físico · <b>PV</b> = BAC × avanço planejado · <b>AC</b> = custo realizado.</li>
          <li><b>SPI</b> = EV ÷ PV · <b>CPI</b> = EV ÷ AC — só calculados quando BAC, avanço e (para CPI) custo real existem.</li>
          <li><b>Projeto atrasado</b>: ativo e (fim planejado vencido OU avanço físico mais de 10 p.p. abaixo do planejado).</li>
          <li><b>Ação atrasada</b>: não concluída/cancelada e prazo anterior a hoje.</li>
          <li><b>Risco alto</b>: probabilidade × impacto ≥ 15 (escala 1–5).</li>
          <li><b>Curva S</b>: % acumulado de ações com prazo até o fim de cada mês (planejado) vs. % concluído até o fim do mês (realizado).</li>
          <li><b>Caminho crítico</b>: método CPM sobre as folhas da EAP; exige início/fim de todas as atividades e dependências cadastradas.</li>
        </ul>
      </Card>
      <Card subtitle="Planilhas" title="Importação e exportação">
        <ul className="list-inside list-disc space-y-1.5 text-sm text-slate-300">
          <li>Baixe o <b>Template oficial</b> em Planilhas. A aba Instruções documenta cada coluna, IDs e relacionamentos.</li>
          <li>Código em branco cria um registro; código preenchido atualiza somente as colunas presentes na planilha.</li>
          <li>Antes de gravar, o sistema valida linha a linha, mostra as alterações e simula a gravação no servidor. A gravação é tudo-ou-nada.</li>
        </ul>
      </Card>
    </div>
  );
}
