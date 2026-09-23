'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Search, Bookmark, UserRound, Mountain } from 'lucide-react';
import { LocationPicker } from '@/features/location/location-picker';
const links = [
  { href: '/', label: 'Descobrir', icon: Compass },
  { href: '/buscar', label: 'Buscar', icon: Search },
  { href: '/salvos', label: 'Salvos', icon: Bookmark },
  { href: '/perfil', label: 'Perfil', icon: UserRound },
];
export function Navigation() {
  const path = usePathname();
  return (
    <>
      <header className="desktop-header">
        <Link href="/" className="brand">
          <Mountain size={34} strokeWidth={2.5} />
          <span>
            Map<span className="green">Run</span>
          </span>
        </Link>
        <nav aria-label="Navegação principal">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={path === href ? 'active' : ''}
              aria-current={path === href ? 'page' : undefined}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <Link href="/buscar" className="desktop-search-link" aria-label="Buscar corridas">
          <Search size={17} />
          <span>Buscar corridas por nome, cidade ou estado…</span>
        </Link>
        <LocationPicker />
        <Link href="/admin" className="desktop-organizer-link">Para organizadores</Link>
        <Link href="/perfil" className="desktop-profile-link" aria-label="Abrir perfil"><UserRound size={22} /></Link>
        <span className="brand-note">Mais corridas. Mais histórias.</span>
      </header>
      <nav className="bottom-nav" aria-label="Navegação mobile">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={path === href ? 'active' : ''}
            aria-current={path === href ? 'page' : undefined}
          >
            <Icon size={23} strokeWidth={path === href ? 2.4 : 1.6} />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
