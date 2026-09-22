import Link from 'next/link';
import { Compass } from 'lucide-react';
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Compass size={36} strokeWidth={1.4} />
      <h2>{title}</h2>
      <p>{description}</p>
      {children || (
        <Link className="button" href="/">
          Descobrir corridas
        </Link>
      )}
    </div>
  );
}
