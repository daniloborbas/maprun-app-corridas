import Link from 'next/link';
import { Instagram } from 'lucide-react';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand"><strong>Map<span>Run</span></strong><p>Encontre sua próxima corrida.</p></div>
        <div><strong>Explorar</strong><Link href="/">Descobrir</Link><Link href="/buscar">Buscar</Link><Link href="/salvos">Salvos</Link></div>
        <div><strong>Organizadores</strong><Link href="/organizadores">Divulgue sua corrida</Link></div>
        <div><strong>Social</strong><a className="site-footer-instagram" href="https://www.instagram.com/maprunapp/" target="_blank" rel="noopener noreferrer"><Instagram size={16} />@maprunapp</a></div>
      </div>
      <div className="site-footer-bottom"><Link href="/privacidade">Privacidade</Link><span>© {new Date().getFullYear()} MapRun</span></div>
    </footer>
  );
}
