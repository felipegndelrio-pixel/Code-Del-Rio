export default function Setup() {
  return (
    <div className="mx-auto max-w-2xl p-6 text-slate-200">
      <h1 className="headline text-2xl font-extrabold">Configuração pendente</h1>
      <p className="mt-3 text-sm">
        As variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> não foram definidas neste build. Consulte o README
        (seção “Implantação”) para criar o projeto Supabase gratuito, aplicar as migrations e configurar as variáveis no Netlify.
      </p>
      <p className="mt-3 text-sm text-slate-400">Nenhum dado é exibido ou armazenado enquanto a configuração não for concluída.</p>
    </div>
  );
}
