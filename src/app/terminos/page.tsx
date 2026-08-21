import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Términos y condiciones — Kalai Analytics',
  description: 'Términos y condiciones de uso de los productos de Kalai Analytics.',
}

export default function TerminosPage() {
  return (
    <LegalPage title="Términos y condiciones" updatedAt="20 de agosto de 2026">
      <h2>Qué es Kalai Analytics</h2>
      <p>
        Kalai Analytics ofrece herramientas para el mundo de la vela deportiva: <strong>Coach Data</strong> (app
        para entrenadores, que registra y analiza viento, corriente y recorrido durante sesiones de entrenamiento o
        regata) y <strong>Regatta RC</strong> (app para oficiales de regata, para calcular y verificar el fondeo de
        las boyas del recorrido). Al crear una cuenta en cualquiera de los dos, aceptás estos términos.
      </p>

      <h2>Tu cuenta</h2>
      <p>
        Tu cuenta de Kalai Analytics es compartida entre productos — un mismo login te identifica en Coach Data,
        Regatta RC y este sitio. Sos responsable de mantener segura tu contraseña y de toda la actividad que ocurra
        en tu cuenta. Si generás un link de sesión compartida, sos vos quien decide con quién lo compartís.
      </p>

      <h2>Planes: Gratis y Pro</h2>
      <p>
        Cada producto tiene su propio plan Gratis con límites de uso, y su propio plan Pro sin límites — el detalle
        completo de qué incluye cada uno está siempre actualizado en <a href="/">la página de precios</a>. Las
        cuentas nuevas de Coach Data arrancan con un mes de Pro de prueba, sin cargo.
      </p>

      <h2>Facturación</h2>
      <p>
        Las suscripciones Pro (de Coach Data y de Regatta RC) se cobran por fuera de la app, con Mercado Pago. La
        suscripción se renueva automáticamente (mensual o anual, según lo que hayas elegido) hasta que la canceles.
        Podés cancelar en cualquier momento desde la sección Suscripciones de tu cuenta de Mercado Pago — al
        cancelar, conservás el Pro hasta el final del período ya pagado.
      </p>

      <h2>Uso aceptable</h2>
      <p>
        Pedimos que uses nuestros productos solo para su propósito: analizar tus propias sesiones de navegación (o
        las de tu equipo), u operar tu propia cancha de regata. No está permitido intentar acceder a datos de otras
        cuentas, revender el servicio, ni hacer ingeniería inversa de las apps.
      </p>

      <h2>Un aviso importante sobre las mediciones</h2>
      <p>
        Nuestras apps son una herramienta de apoyo para el análisis táctico y la operación de la cancha —{' '}
        <strong>no reemplazan el juicio del entrenador, del oficial de regata ni del timonel</strong>. Las
        mediciones de viento, corriente y posición dependen del GPS y el compás del teléfono, que tienen un margen
        de error normal en cualquier dispositivo móvil. Las decisiones de navegación y de seguridad en el agua son
        siempre responsabilidad de quien está a cargo de la embarcación o de la regata.
      </p>

      <h2>Disponibilidad del servicio</h2>
      <p>
        Estamos mejorando las apps de forma continua — puede haber mantenimiento programado o cambios en las
        funciones disponibles. Vamos a avisar con anticipación razonable ante cualquier cambio importante.
      </p>

      <h2>Terminación de cuenta</h2>
      <p>
        Podés pedir la eliminación de tu cuenta en cualquier momento escribiendo a{' '}
        <a href="mailto:info@kalai.com.ar">info@kalai.com.ar</a>. Nosotros podemos suspender o cerrar una cuenta que
        incumpla estos términos.
      </p>

      <h2>Ley aplicable</h2>
      <p>Estos términos se rigen por las leyes de la República Argentina.</p>

      <h2>Contacto</h2>
      <p>
        Cualquier consulta sobre estos términos, escribinos a <a href="mailto:info@kalai.com.ar">info@kalai.com.ar</a>.
      </p>
    </LegalPage>
  )
}
