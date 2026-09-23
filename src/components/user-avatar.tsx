'use client';
import Image from 'next/image';

export function UserAvatar({ name, avatarUrl, googleAvatarUrl, size = 88, className = '' }: { name?: string | null; avatarUrl?: string | null; googleAvatarUrl?: string | null; size?: number; className?: string }) {
  const initials = (name || 'MapRun').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'M';
  const src = avatarUrl || googleAvatarUrl;
  return <div className={`user-avatar ${className}`} style={{ width: size, height: size }} aria-label={name ? `Foto de ${name}` : 'Foto de perfil'}>{src ? <Image src={src} alt="" fill sizes={`${size}px`} className="user-avatar-image" unoptimized={Boolean(googleAvatarUrl && !avatarUrl)} /> : <span>{initials}</span>}</div>;
}
