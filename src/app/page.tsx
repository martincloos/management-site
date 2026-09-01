'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function LandingPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSignedIn(!!session))
  }, [])

  return (
    <div className="landing">
      <header className="landingHeader">
        <div className="landingLogo">Kalai Analytics</div>
        <Link href={signedIn ? '/cuenta' : '/login'} className="button landingHeaderButton">
          {signedIn ? 'Mi cuenta' : 'Iniciar sesión'}
        </Link>
      </header>

      <section className="landingHero">
        <h1 className="landingTitle">Herramientas de nivel profesional para la vela deportiva</h1>
        <p className="landingSubtitle">
          Registrá y analizá condiciones de regata, corré tu cancha, y gestioná tu club o tu evento — todo bajo una
          misma cuenta.
        </p>
        <Link href={signedIn ? '/cuenta' : '/login'} className="button landingCta">
          {signedIn ? 'Ir a mi cuenta' : 'Empezar ahora'}
        </Link>
      </section>

      <section className="landingSection">
        <div className="sectionTitle">Quiénes somos</div>
        <p className="landingBody">
          Kalai Analytics construye las herramientas que hoy le faltan a la vela deportiva: para el entrenador que
          quiere entender qué pasó en el agua, para el oficial de regata que necesita fondear una cancha rápido y
          bien, y para el club o evento que necesita coordinar entrenadores, navegantes y comunicación en un solo
          lugar.
        </p>
      </section>

      <section className="landingSection">
        <div className="sectionTitle">Qué ofrecemos</div>
        <div className="landingCards">
          <div className="card">
            <div className="landingCardTitle">Para entrenadores</div>
            <div className="subtitle"><strong>Coach Data</strong></div>
            <p className="landingBody">
              Registrá viento, corriente y recorrido en tiempo real durante tus sesiones, y analizá después qué lado
              de la cancha pagaba y por qué.
            </p>
          </div>
          <div className="card">
            <div className="landingCardTitle">Para oficiales de regata</div>
            <div className="subtitle"><strong>Regatta RC</strong></div>
            <p className="landingBody">
              Calculá, comunicá y verificá el fondeo de las boyas del recorrido, con guía en tiempo real para tus
              balizadores y secuencia de largada cronometrada.
            </p>
          </div>
          <div className="card">
            <div className="landingCardTitle">Para clubes y eventos</div>
            <div className="subtitle">Gestión de organización</div>
            <p className="landingBody">
              Coordiná entrenadores, acreditación de navegantes, check-in/check-out y ventanas de tiempo — todo desde
              un mismo panel, con roles e invitaciones por email.
            </p>
          </div>
        </div>
      </section>

      <footer className="landingFooter">
        <span>© {new Date().getFullYear()} Kalai Analytics</span>
        <div className="landingFooterLinks">
          <Link href="/terminos" className="link">Términos y condiciones</Link>
          <Link href="/privacidad" className="link">Política de privacidad</Link>
          <Link href="/eliminar-cuenta" className="link">Eliminar mi cuenta</Link>
          <a href="mailto:info@kalai.com.ar" className="link">info@kalai.com.ar</a>
        </div>
      </footer>

      <style>{`
        .landing {
          max-width: 1040px;
          margin: 0 auto;
          padding: 32px 24px 64px;
          display: flex;
          flex-direction: column;
          gap: 64px;
        }
        .landingHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .landingLogo {
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .landingHeaderButton {
          padding: 9px 18px;
          font-size: 14px;
          text-decoration: none;
          display: inline-block;
        }
        .landingHero {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 640px;
          padding-top: 24px;
        }
        .landingTitle {
          font-size: 40px;
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.15;
          margin: 0;
        }
        .landingSubtitle {
          font-size: 17px;
          line-height: 1.6;
          color: var(--muted);
          margin: 0;
        }
        .landingCta {
          width: fit-content;
          padding: 13px 24px;
          font-size: 15px;
          text-decoration: none;
        }
        .landingSection {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .landingBody {
          font-size: 15px;
          line-height: 1.7;
          color: var(--muted);
          margin: 0;
          max-width: 680px;
        }
        .landingCards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        .landingCardTitle {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--accent);
        }
        .landingFooter {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          padding-top: 32px;
          border-top: 1px solid var(--border);
          font-size: 13px;
          color: var(--muted);
        }
        .landingFooterLinks {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
        }
        @media (max-width: 720px) {
          .landingCards { grid-template-columns: 1fr; }
          .landingTitle { font-size: 30px; }
        }
      `}</style>
    </div>
  )
}
