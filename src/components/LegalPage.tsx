import Link from 'next/link'
import type { PropsWithChildren } from 'react'

interface LegalPageProps {
  title: string
  updatedAt: string
}

export function LegalPage({ title, updatedAt, children }: PropsWithChildren<LegalPageProps>) {
  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '48px 20px 96px' }}>
      <Link href="/" style={{ color: 'var(--accent)', fontSize: 14, textDecoration: 'none', fontWeight: 600 }}>
        ← Kalai Analytics
      </Link>
      <h1 style={{ fontSize: 30, margin: '16px 0 4px', letterSpacing: '-0.01em' }}>{title}</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 40px' }}>Última actualización: {updatedAt}</p>
      <div className="legal-body">{children}</div>
      <style>{`
        .legal-body h2 {
          font-size: 19px;
          margin: 36px 0 12px;
          padding-top: 20px;
          border-top: 1px solid var(--border);
        }
        .legal-body h2:first-child { border-top: none; padding-top: 0; margin-top: 0; }
        .legal-body p, .legal-body li {
          font-size: 15.5px;
          line-height: 1.7;
          color: var(--muted);
        }
        .legal-body strong { color: var(--foreground); font-weight: 600; }
        .legal-body ul { padding-left: 20px; margin: 8px 0; }
        .legal-body li { margin-bottom: 6px; }
        .legal-body a { color: var(--accent); }
      `}</style>
    </main>
  )
}
