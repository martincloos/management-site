import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Privacidad — Kalai Analytics',
  description: 'Política de privacidad de los productos de Kalai Analytics.',
}

export default function PrivacidadPage() {
  return (
    <LegalPage title="Política de privacidad" updatedAt="20 de agosto de 2026">
      <h2>Quién es responsable de tus datos</h2>
      <p>
        <strong>Kalai Analytics</strong> es responsable de tus datos en Coach Data, Regatta RC y este sitio. Para
        cualquier consulta sobre tus datos personales, o para pedir que los corrijamos o eliminemos, escribinos a{' '}
        <a href="mailto:info@kalai.com.ar">info@kalai.com.ar</a>.
      </p>

      <h2>Cuenta compartida</h2>
      <p>
        Usás el mismo login (email y nombre) en Coach Data, Regatta RC y este sitio — es un solo perfil de usuario
        compartido entre los tres.
      </p>

      <h2>Qué datos recolecta Coach Data</h2>
      <ul>
        <li>
          <strong>Ubicación GPS precisa:</strong> mientras tenés una sesión activa, para registrar dónde arrancó la
          sesión, dónde tomaste cada medición de corriente y dónde ubicaste las boyas del recorrido. Solo se pide
          mientras usás la app en primer plano — nunca en segundo plano.
        </li>
        <li>
          <strong>Datos del compás del dispositivo:</strong> para calcular la dirección del viento durante una
          medición.
        </li>
        <li>
          <strong>Datos de la sesión:</strong> mediciones de viento y corriente, notas, clase de embarcación, fecha
          y hora.
        </li>
        <li><strong>Preferencias:</strong> idioma, unidades de medida y tema (claro/oscuro).</li>
      </ul>

      <h2>Qué datos recolecta Regatta RC</h2>
      <p>
        Ubicación GPS mientras fondeás una boya o guiás a un balizador (para calcular y verificar la posición del
        recorrido), y los datos operativos de la cancha/evento que cargás como oficial de regata (nombre del
        evento, boyas, canchas). Los balizadores pueden usar la app sin necesidad de cuenta, por código.
      </p>

      <h2>Estado de tu suscripción</h2>
      <p>
        Guardamos si estás en el plan Gratis o Pro de cada producto, y que pagás con Mercado Pago — nunca vemos ni
        guardamos el número de tu tarjeta ni ningún otro dato financiero: eso lo procesa directamente Mercado Pago,
        fuera de nuestras apps.
      </p>

      <h2>Para qué los usamos</h2>
      <p>
        Para el propósito central de cada app: ayudarte a analizar las condiciones de viento, corriente y recorrido
        de una sesión de navegación, u operar tu cancha de regata; mostrarte tu historial; y — si vos decidís
        generar un link — permitir que otra persona vea esa sesión o cancha en tiempo real. También para administrar
        tu cuenta y tus suscripciones desde este sitio.
      </p>

      <h2>Con quién se comparten</h2>
      <ul>
        <li>
          <strong>Supabase:</strong> aloja nuestras bases de datos y el sistema de autenticación. Es quien
          efectivamente guarda tus datos en nuestro nombre.
        </li>
        <li>
          <strong>Otros participantes de una sesión o cancha compartida:</strong> si generás un link para
          compartir una sesión o cancha, cualquiera que lo abra ve las mediciones y la ubicación de esa sesión o
          cancha puntual — ninguna otra.
        </li>
        <li>
          <strong>Mercado Pago:</strong> recibe tu email para procesar el pago de la suscripción. No recibe datos
          de tus sesiones de navegación ni de tu cancha de regata.
        </li>
      </ul>
      <p>
        No vendemos tus datos a nadie, y no usamos rastreadores publicitarios ni herramientas de analítica de
        terceros dentro de las apps.
      </p>

      <h2>Cuánto tiempo los conservamos</h2>
      <p>
        Mientras tu cuenta esté activa. Si pedís que la eliminemos, borramos tu cuenta y los datos asociados en un
        plazo razonable, salvo que tengamos que conservar algo por una obligación legal (por ejemplo, registros de
        facturación).
      </p>

      <h2>Tus derechos</h2>
      <p>
        Podés pedirnos en cualquier momento acceder a tus datos, corregirlos, exportarlos o eliminarlos, escribiendo
        a <a href="mailto:info@kalai.com.ar">info@kalai.com.ar</a>. Esto aplica los derechos reconocidos por la Ley
        25.326 de Protección de Datos Personales de Argentina y, si nos escribís desde la Unión Europea, los
        principios del RGPD.
      </p>

      <h2>Menores de edad</h2>
      <p>
        Nuestros productos no están dirigidos a menores de 13 años y no recolectamos a sabiendas datos de menores
        de esa edad.
      </p>

      <h2>Cambios a esta política</h2>
      <p>
        Si hacemos cambios importantes, vamos a actualizar la fecha al principio de esta página. Te recomendamos
        revisarla de tanto en tanto.
      </p>
    </LegalPage>
  )
}
