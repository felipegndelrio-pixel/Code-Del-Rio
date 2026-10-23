// Sair deste aparelho: remove só a autorização local (token da licença e modo de
// demonstração). Projetos (IndexedDB), backups, tema, tour e rascunhos ficam. Não é
// revogação: a compra continua valendo e o mesmo e-mail entra de novo.
import { clearToken } from './config';
import { endDemo } from './demo';

export function signOut() {
  clearToken();
  endDemo();
}
