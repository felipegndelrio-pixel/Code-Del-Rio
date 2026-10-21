// Política de Privacidade (LGPD) e Termos de Uso. Públicas: acessíveis sem compra.
// O conteúdo descreve só o que o app faz de fato (ver Ajuda → Privacidade e
// api/_lib/store.ts); ao mudar coleta, armazenamento ou prazos, atualize aqui.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BackButton } from '../components/BackButton';
import { BRAND, COMMERCIAL, LEGAL } from '../config/brand';

const UPDATED = '21/10/2026';

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="safe-x mx-auto max-w-3xl py-6 text-ink">
      <BackButton fallback="/" />
      <h1 className="mt-2 text-2xl font-extrabold">{title}</h1>
      <p className="mt-1 text-sm text-muted">Última atualização: {UPDATED}</p>
      <div className="mt-4 space-y-5 text-sm leading-relaxed text-ink2 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
      <p className="mt-8 border-t border-line/15 pt-3 text-xs text-muted">
        <Link to="/privacidade" className="underline">
          Política de Privacidade
        </Link>{' '}
        ·{' '}
        <Link to="/termos" className="underline">
          Termos de Uso
        </Link>{' '}
        · <Link to="/app/ajuda" className="underline">Ajuda</Link>
      </p>
    </article>
  );
}

function Controller() {
  const email = COMMERCIAL.contactEmail && (
    <a href={`mailto:${COMMERCIAL.contactEmail}`} className="font-semibold text-accent underline">
      {COMMERCIAL.contactEmail}
    </a>
  );
  if (!LEGAL.controller)
    return (
      <>
        o produtor que vende o {BRAND.name} na Hotmart
        {email && <>, contato: {email}</>}
      </>
    );
  return (
    <>
      <strong>{LEGAL.controller}</strong>
      {LEGAL.id && <>, inscrito no CPF/CNPJ sob o nº {LEGAL.id}</>}
      {email && <>, com contato pelo e-mail {email}</>}
    </>
  );
}

export function Privacy() {
  return (
    <Page title="Política de Privacidade">
      <section>
        <h2>1. Resumo</h2>
        <p>
          Para liberar seu acesso, tratamos o <strong>e-mail da compra e dados da transação</strong>. Os dados dos seus processos <strong>ficam salvos apenas no seu aparelho</strong>. O site utiliza registros técnicos de acesso (IP, navegador) para segurança, conforme detalhado abaixo.
        </p>
      </section>
      <section>
        <h2>2. Quem é o controlador</h2>
        <p>
          Controlador dos dados, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018): <Controller />. A Hotmart é controladora dos dados da compra e do pagamento, conforme a política de privacidade dela.
        </p>
      </section>
      <section>
        <h2>3. Que dados tratamos, para quê e com que base legal</h2>
        <ul>
          <li>
            <strong>E-mail da compra, situação da compra (ativa, reembolsada ou cancelada), produto, número da transação e data</strong> — enviados pela Hotmart quando a compra é aprovada, reembolsada ou cancelada. Finalidade: liberar e manter o seu acesso. Base legal: execução de contrato (art. 7º, V).
          </li>
          <li>
            <strong>Dados técnicos de acesso</strong> (endereço IP, navegador, data e hora), registrados pela hospedagem como em qualquer site. Finalidade: segurança e funcionamento. Base legal: legítimo interesse (art. 7º, IX).
          </li>
          <li>
            <strong>E-mails que você enviar ao suporte</strong>. Finalidade: responder ao seu pedido. Base legal: execução de contrato.
          </li>
        </ul>
      </section>
      <section>
        <h2>4. O que NÃO coletamos</h2>
        <ul>
          <li>O conteúdo dos seus processos, planilhas, mapas, cenários, planos e relatórios. Tudo isso é processado e salvo no seu navegador (IndexedDB e localStorage) e não é enviado aos nossos servidores.</li>
          <li>Não usamos cookies de rastreamento, analytics, pixels de publicidade nem ferramentas de terceiros dentro do app.</li>
          <li>Não usamos inteligência artificial generativa nem enviamos seus dados a serviços de IA.</li>
        </ul>
      </section>
      <section>
        <h2>5. Com quem compartilhamos</h2>
        <ul>
          <li>
            <strong>Hotmart</strong>: plataforma de venda e pagamento.
          </li>
          <li>
            <strong>Cloudflare</strong>: hospedagem do site e da verificação de acesso.
          </li>
          <li>
            <strong>Supabase</strong>: banco de dados que guarda o registro de compra (e-mail e situação).
          </li>
        </ul>
        <p className="mt-2">Esses fornecedores atuam como operadores e podem armazenar dados fora do Brasil, com as salvaguardas previstas nos contratos deles (art. 33 da LGPD). Não vendemos nem cedemos seus dados.</p>
      </section>
      <section>
        <h2>6. Por quanto tempo guardamos</h2>
        <p>
          O registro da compra é mantido enquanto o seu acesso existir e, depois de reembolso ou cancelamento, pelo tempo necessário para impedir acessos indevidos e cumprir obrigações legais. Os dados no seu aparelho ficam lá até você apagá-los (Meus projetos → Apagar dados locais) ou limpar os dados do navegador.
        </p>
      </section>
      <section>
        <h2>7. Seus direitos</h2>
        <p>
          Você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação dos dados e informações sobre compartilhamento (art. 18 da LGPD), escrevendo para o contato do item 2. Respondemos em até 15 dias. Se pedir a eliminação do e-mail, o acesso ao app deixa de poder ser liberado.
          Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </section>
      <section>
        <h2>8. Segurança</h2>
        <p>
          A verificação de acesso usa conexão criptografada (HTTPS) e uma assinatura digital; o banco de registros de compra é acessado só pelo servidor. Como os seus processos ficam no seu aparelho, a proteção deles depende também do bloqueio do aparelho e de quem tem acesso a ele.
        </p>
      </section>
      <section>
        <h2>9. Alterações</h2>
        <p>Se esta política mudar, a data no topo é atualizada e, em mudanças relevantes, avisamos pelo e-mail da compra.</p>
      </section>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Termos de Uso">
      <section>
        <h2>1. O que é o {BRAND.name}</h2>
        <p>
          Um aplicativo web (PWA) para mapear processos, gerar mapas BPMN, diagnosticar desperdícios, comparar o processo atual com o proposto, estimar um business case e montar um plano de ação. Funciona em navegadores atualizados no computador, no iPhone/iPad (Safari) e no Android (Chrome). Idioma: português.
        </p>
      </section>
      <section>
        <h2>2. Acesso e licença</h2>
        <ul>
          <li>A compra na Hotmart dá uma licença de uso individual, não exclusiva e intransferível, ligada ao e-mail usado na compra.</li>
          <li>Você pode usar o app em quantos aparelhos quiser com o mesmo e-mail, para processos próprios ou de clientes (uso profissional permitido).</li>
          <li>Não é permitido compartilhar o acesso com outras pessoas, revender, copiar ou redistribuir o app.</li>
          <li>É preciso internet no primeiro acesso de cada aparelho. Depois, o app funciona sem internet e renova o acesso sozinho quando houver conexão; sem nenhuma conexão por mais de 30 dias, ele pede para conectar de novo.</li>
        </ul>
      </section>
      <section>
        <h2>3. Garantia e reembolso</h2>
        <p>
          Você tem 7 dias a partir da compra para pedir reembolso pela Hotmart, sem precisar justificar (art. 49 do Código de Defesa do Consumidor). Com o reembolso ou cancelamento, o acesso é encerrado. Os arquivos que você já exportou continuam seus.
        </p>
      </section>
      <section>
        <h2>4. Seus dados são responsabilidade sua</h2>
        <ul>
          <li>Os processos ficam salvos só no navegador do aparelho em que foram criados. Não há sincronização automática entre aparelhos; para levar um projeto a outro aparelho, use Visão geral → Gerar arquivo do projeto e, no outro aparelho, Importar projeto.</li>
          <li>Limpar os dados do navegador, desinstalar o app, trocar ou perder o aparelho apaga os processos daquele aparelho. Faça backups regulares em Meus projetos → Baixar backup. Não temos cópia dos seus dados e não conseguimos recuperá-los.</li>
        </ul>
      </section>
      <section>
        <h2>5. Natureza das análises</h2>
        <p>
          Os cálculos são determinísticos e documentados no app (“Como calculamos”). Diagnósticos, recomendações, economias, payback e ROI são <strong>estimativas</strong> baseadas nos dados e premissas que você informa; não são garantia de resultado. Decisões tomadas com base nelas são de responsabilidade de quem decide. O app não substitui consultoria, auditoria ou análise jurídica, contábil ou financeira.
        </p>
      </section>
      <section>
        <h2>6. Disponibilidade e atualizações</h2>
        <p>
          Podemos atualizar o app para corrigir problemas e melhorar recursos; as atualizações chegam automaticamente. Buscamos manter o serviço disponível, mas podem ocorrer interrupções da hospedagem ou da Hotmart. Se o produto for descontinuado, avisaremos pelo e-mail da compra com pelo menos 30 dias de antecedência para que você exporte seus dados.
        </p>
      </section>
      <section>
        <h2>7. Propriedade intelectual</h2>
        <p>
          O app, a marca e os textos pertencem ao produtor. Os processos, dados e relatórios que você cria são seus. Os mapas são desenhados com bpmn-js (bpmn.io), cuja marca aparece nos diagramas conforme a licença dessa biblioteca. {BRAND.name} não é afiliado ao PMI® nem a fornecedores de ferramentas de processos.
        </p>
      </section>
      <section>
        <h2>8. Suporte</h2>
        <p>
          Dúvidas e problemas: <Controller />. Informe o e-mail da compra, o aparelho e o navegador.
        </p>
      </section>
      <section>
        <h2>9. Lei aplicável</h2>
        <p>Estes termos seguem a lei brasileira, incluindo o Código de Defesa do Consumidor e a LGPD. Fica eleito o foro do domicílio do consumidor.</p>
      </section>
    </Page>
  );
}
