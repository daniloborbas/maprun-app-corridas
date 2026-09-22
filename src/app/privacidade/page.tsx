export const metadata = { title: 'Privacidade e dados' };
export default function PrivacyPage() {
  return (
    <article className="page prose">
      <h1>Privacidade, com clareza.</h1>
      <p>O MapRun usa apenas os dados necessários para ajudar você a descobrir corridas.</p>
      <h2>Localização opcional</h2>
      <p>
        Ao permitir, sua posição é usada nesta sessão para calcular distâncias aproximadas. Não
        acompanhamos deslocamentos nem salvamos a localização precisa. Uma cidade escolhida
        manualmente fica neste navegador até você selecionar “Explorar sem localização”.
      </p>
      <h2>Sua conta e suas escolhas</h2>
      <p>
        Com uma conta, seu nome, cidade, preferências, eventos salvos e intenções de participação
        são armazenados no banco do MapRun. A autenticação é fornecida pelo Supabase. Não publicamos
        listas de participantes.
      </p>
      <h2>Métricas de uso</h2>
      <p>
        Com sua permissão, registramos ações como visualizações, buscas, compartilhamentos e
        favoritos, com um identificador de sessão, origem de acesso e conta quando autenticada. Não
        registramos o texto das buscas nem coordenadas precisas nas métricas. Cliques de inscrição
        também têm uma contagem operacional para medir o funcionamento dos links.
      </p>
      <h2>Inscrições em outros sites</h2>
      <p>
        O MapRun não processa pagamentos ou inscrições. Ao abrir o site do organizador, passam a
        valer as políticas desse serviço.
      </p>
      <h2>Controle dos dados</h2>
      <p>
        Você pode remover favoritos, desmarcar “Eu vou”, editar seu perfil e revogar métricas no
        botão abaixo. Para apagar dados locais, também é possível limpar os dados deste site no
        navegador.
      </p>
      <form action="/api/privacy" method="post">
        <button className="button secondary">Revogar métricas neste navegador</button>
      </form>
      <h2>Antes do lançamento público</h2>
      <p>
        Esta é a política preliminar do MVP. A identificação do controlador, o canal para pedidos de
        acesso e exclusão e os prazos de retenção devem ser definidos pela equipe antes de receber
        usuários reais.
      </p>
    </article>
  );
}
