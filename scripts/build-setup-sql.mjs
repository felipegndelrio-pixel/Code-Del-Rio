// Gera supabase/setup.sql: todas as migrations em um único arquivo para colar
// no SQL Editor do Supabase (instalação em um passo).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = 'supabase/migrations';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const head = `-- =====================================================================
-- INSTALAÇÃO EM UM PASSO — cole TODO este arquivo no SQL Editor do seu
-- projeto Supabase (plano Free) e clique em Run. Execute apenas UMA vez,
-- em projeto novo. Gerado por scripts/build-setup-sql.mjs a partir de:
${files.map((f) => `--   ${f}`).join('\n')}
-- =====================================================================
`;
writeFileSync('supabase/setup.sql', head + files.map((f) => `\n-- >>>>> ${f}\n` + readFileSync(`${dir}/${f}`, 'utf8')).join('\n'));
console.log(`supabase/setup.sql gerado (${files.length} migrations)`);
