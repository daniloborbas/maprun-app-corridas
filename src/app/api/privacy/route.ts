export async function POST() {
  return new Response(
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Preferência atualizada</title><script>localStorage.setItem("maprun.analytics","no");sessionStorage.removeItem("maprun.session");sessionStorage.removeItem("maprun.acquisition");location.replace("/privacidade")</script><p>Preferência atualizada. <a href="/privacidade">Voltar</a></p></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}
