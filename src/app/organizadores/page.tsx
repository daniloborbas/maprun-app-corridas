import Link from 'next/link';

export const metadata = {
  title: 'Divulgue sua corrida',
  description: 'Cadastre sua prova e alcance corredores no MapRun.',
};

export default function OrganizersPage() {
  return (
    <section className="organizers-page page" id="interesse">
      <span className="eyebrow green">PARA ORGANIZADORES</span>
      <h1>Divulgue sua corrida no MapRun</h1>
      <p>Cadastre sua prova e alcance corredores que estão procurando eventos perto deles.</p>
      <Link className="button" href="/organizadores#interesse">Quero divulgar minha corrida</Link>
    </section>
  );
}
