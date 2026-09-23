'use client';
import Image from 'next/image';
import { useState } from 'react';

export function resolveAvatarSource(avatarUrl?: string | null, googleAvatarUrl?: string | null, failedCustom = false, failedGoogle = false) {
  if (avatarUrl && !failedCustom) return { src: avatarUrl, source: 'custom' as const };
  if (googleAvatarUrl && !failedGoogle) return { src: googleAvatarUrl, source: 'google' as const };
  return { src: null, source: 'initials' as const };
}

export function UserAvatar({ name, avatarUrl, googleAvatarUrl, size = 88, className = '' }: { name?: string | null; avatarUrl?: string | null; googleAvatarUrl?: string | null; size?: number; className?: string }) {
  const initials = (name || 'MapRun').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'M';
  const [failedCustom, setFailedCustom] = useState(false);
  const [failedGoogle, setFailedGoogle] = useState(false);
  const resolved = resolveAvatarSource(avatarUrl, googleAvatarUrl, failedCustom, failedGoogle);
  const customSrc = resolved.source === 'custom' ? resolved.src : null;
  const src = resolved.src;
  return <div className={`user-avatar ${className}`} style={{ width: size, height: size }} aria-label={name ? `Foto de ${name}` : 'Foto de perfil'}>{src ? <Image src={src} alt="" fill sizes={`${size}px`} className="user-avatar-image" unoptimized onError={() => customSrc ? setFailedCustom(true) : setFailedGoogle(true)} /> : <span>{initials}</span>}</div>;
}
