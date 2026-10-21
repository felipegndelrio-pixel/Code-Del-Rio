// Impressão com nome de arquivo correto. O "Salvar como PDF" sugere o título da página;
// o Safari do iPhone nem sempre dispara `afterprint`, então o título trocado ficava
// preso ("Plano de ação - …") e o PDF seguinte saía com o nome errado. As telas que
// imprimem chamam restoreTitle ao desmontar.
let saved: string | null = null;

export function restoreTitle() {
  if (saved !== null) {
    document.title = saved;
    saved = null;
  }
}

export function printAs(title: string) {
  if (saved === null) saved = document.title;
  document.title = title;
  window.addEventListener('afterprint', restoreTitle, { once: true });
  window.print();
}
