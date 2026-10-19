import { Link } from 'react-router-dom';
import { Card, Callout } from '../components/ui';
import { BRAND } from '../config/brand';
import { GLOSSARY } from '../config/glossary';
import { FIELDS } from '../io/fields';

export default function Help() {
  return (
    <div className="safe-x mx-auto max-w-4xl space-y-5 py-6">
      <h1 className="text-2xl font-bold">Ajuda</h1>

      <Card title="Como funciona" subtitle="Jornada">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink2">
          <li>Descreva o processo atual (AS-IS) pelo assistente ou importando uma planilha.</li>
          <li>Corrija os erros apontados na validação (os alertas podem ser aceitos).</li>
          <li>Veja o mapa: clique em uma etapa para abrir atividades, decisões e retrabalho.</li>
          <li>Leia o diagnóstico: tempo, esforço, desperdício e gargalos, com a regra de cada número.</li>
          <li>Aceite, rejeite ou investigue as recomendações.</li>
          <li>Monte o cenário futuro (TO-BE) — uma cópia; o AS-IS fica intacto.</li>
          <li>Compare os cenários e gere o plano de ação.</li>
          <li>Depois de implantar, registre os resultados reais e compare com o estimado.</li>
        </ol>
      </Card>

      <Card title="Glossário" subtitle="Termos explicados">
        <dl className="grid gap-3 sm:grid-cols-2">
          {Object.values(GLOSSARY).map((g) => (
            <div key={g.term}>
              <dt className="font-semibold text-ink">{g.term}</dt>
              <dd className="text-sm text-ink2">{g.text}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="Como calculamos" subtitle="Fórmulas">
        <ul className="space-y-2 text-sm text-ink2">
          <li><strong className="text-ink">Esforço (pessoa-hora)</strong> = duração em horas × pessoas trabalhando ao mesmo tempo.</li>
          <li><strong className="text-ink">Esforço por execução</strong> = Σ esforço de cada atividade × frequência (sem frequência informada = 100%, e avisamos).</li>
          <li><strong className="text-ink">Esforço por período</strong> = esforço por execução × volume do período (ou volume próprio da atividade).</li>
          <li><strong className="text-ink">Custo de mão de obra</strong> = esforço no período × custo-hora (da atividade, senão da função, senão o padrão). Sem custo-hora, não há valor em R$.</li>
          <li><strong className="text-ink">Custo total</strong> = mão de obra + custo variável × execuções — exceto quando você declara que o custo variável já inclui mão de obra (aí não somamos de novo).</li>
          <li><strong className="text-ink">Distribuição Lean</strong> = horas de cada classe ÷ horas classificadas (base: duração, não quantidade).</li>
          <li><strong className="text-ink">Soma das durações</strong> ≠ <strong className="text-ink">tempo decorrido</strong>: o tempo decorrido é o caminho mais longo do início ao fim, com esperas informadas e sem retrabalho.</li>
          <li><strong className="text-ink">Gargalo</strong> = participação ≥ limiar (padrão 15%) no critério escolhido; máximo de 5. Indica concentração, não causa.</li>
          <li><strong className="text-ink">Horas liberadas</strong> = esforço AS-IS − esforço TO-BE no mesmo volume. <strong className="text-ink">Benefício bruto</strong> = custo AS-IS − custo TO-BE. <strong className="text-ink">Líquido</strong> = bruto − custo recorrente novo.</li>
          <li><strong className="text-ink">Payback</strong> = investimento ÷ benefício líquido mensal (positivo). <strong className="text-ink">ROI</strong> = (líquido mensal × horizonte − investimento) ÷ investimento × 100.</li>
          <li><strong className="text-ink">Redução %</strong> = (antes − depois) ÷ antes × 100, só quando “antes” &gt; 0.</li>
          <li><strong className="text-ink">Simulação</strong>: distribuição triangular (mínimo, mais provável, máximo), 1.500 iterações por padrão, semente fixa.</li>
        </ul>
        <p className="mt-3 text-xs text-muted">Arredondamos apenas para exibir; os cálculos usam os valores originais. Detalhes técnicos em docs/CALCULOS.md no repositório.</p>
      </Card>

      <Card title="Campos da planilha" subtitle="Modelo de importação">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {FIELDS.map((f) => (
            <li key={f.key}>
              <strong className="text-ink">{f.label}</strong> {f.minimal && <span className="text-xs text-brand">(mínimo)</span>}
              <br />
              <span className="text-ink2">{f.help}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Privacidade e dados" subtitle="O que fica onde" id="privacidade">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink2">
          <li>Planilhas são lidas no seu navegador. O conteúdo não é enviado a servidores.</li>
          <li>Processos, cenários, planos, resultados e rascunhos ficam no IndexedDB deste navegador (banco “nexoprocess”). A preferência de tema fica no localStorage.</li>
          <li>O site é entregue por uma hospedagem estática. Como em qualquer site, ela recebe as requisições dos arquivos do app (endereço IP, navegador, horário) — não o conteúdo dos seus processos.</li>
          <li>Não há contas, rastreadores de terceiros ou analytics no app.</li>
          <li>Limpar os dados do navegador apaga os processos. Use “Baixar backup” em Meus processos.</li>
          <li>Você pode apagar tudo a qualquer momento em Meus processos → Apagar dados locais.</li>
        </ul>
      </Card>

      <Card title="Inteligência artificial" subtitle="Opcional, futuro">
        <p className="text-sm text-ink2">
          Hoje as recomendações são <strong>baseadas em regras transparentes</strong>, sem IA generativa. Uma integração opcional com provedor de IA pode ser adicionada no futuro, desde que: (1) a chave fique em um servidor, nunca no navegador; (2) nada seja enviado sem
          seu consentimento explícito; (3) o produto continue funcionando sem ela.
        </p>
      </Card>

      <Callout tone="info">
        {BRAND.name} é um nome provisório. O app não é afiliado ao PMI® nem a fornecedores de ferramentas de processos. Diagramas renderizados com bpmn-js (bpmn.io) — a marca d’água do bpmn.io permanece visível conforme a licença.{' '}
        <Link to="/app" className="font-semibold text-brand">
          Voltar ao app
        </Link>
      </Callout>
    </div>
  );
}
