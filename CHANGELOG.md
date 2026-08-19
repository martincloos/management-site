# Changelog

Registro histórico de cambios importantes al proyecto, ordenado por fecha.
Mismo criterio que [Coach Data](../Coach%20Pro%20Tracker/coach-data/CHANGELOG.md)
y [Regatta RC](../Regatta%20CR/regatta-cr/CHANGELOG.md) — el schema `kalai`
que usa este sitio vive en el repo de Coach Data, así que los cambios de
schema/RLS/funciones se documentan **ahí**, no acá. Este changelog es para
decisiones propias de esta app (código, deploy, diseño).

---

## 2026-08-19 — Suscripciones: checkout real de Regatta RC + unifica el de Coach Data

- **Qué se hizo**: la tarjeta "Suscripciones" del hub Personal (`/`,
  antes solo mostraba estado + un link externo a `kalai.com.ar/pro`)
  pasa a tener un botón real **"+ Agregar"** que ofrece los productos
  que todavía no son Pro (Coach Data / Regatta RC), con selector
  mensual/anual (anual preseleccionado — precio la mitad de 12 meses
  sueltos, a propósito, para empujar la conversión anual) y pago directo
  con Mercado Pago sin salir del sitio ni retipear el email (ya se sabe
  quién sos por la sesión activa).
  - **Coach Data**: nueva ruta `api/checkout/coachdata` que es un simple
    puente hacia el checkout que YA vive en producción en
    `apps/web` de Coach Data (`/api/checkout/mercadopago`) — no se
    duplica esa lógica, solo se evita la vuelta al sitio externo.
  - **Regatta RC**: primer checkout real de este producto. Nueva ruta
    `api/checkout/regattarc` (arma la preapproval de Mercado Pago
    directo, MISMA cuenta/Access Token que Coach Data — decisión
    explícita del usuario) y nuevo webhook
    `api/webhooks/regattarc-mercadopago` (mismo algoritmo de firma que
    el de Coach Data, secreto PROPIO) que escribe en la
    `subscriptions` del proyecto Supabase de Regatta RC vía un cliente
    `service_role` nuevo (`src/lib/regattaAdmin.ts`).
  - **Precio Regatta RC** (cerrado con el usuario 2026-08-19): ARS
    7.500/mes · USD 5/mes · ARS 45.000/año · USD 30/año — el anual es
    literalmente la mitad de 12 meses sueltos (a diferencia de Coach
    Data, que da ~2 meses gratis), a propósito.
  - **El puente de identidad es la parte no obvia**: como Regatta RC es
    un proyecto Supabase separado (ver `docs/INTEGRATION.md` de ese
    repo), antes de crear la preapproval el checkout invoca
    server-side la misma función `exchange-kalai-session` que ya usan
    `race-committee`/`admin`/`RaceCoursesSection` — garantiza que el
    uuid del usuario ya existe como `auth.users` en el proyecto de
    Regatta RC ANTES de cobrar, porque si no el `upsert` del webhook
    (asíncrono, sin el token del usuario a mano) fallaría contra la FK
    de `subscriptions.user_id`.
  - No hizo falta ninguna migración nueva: la tabla `subscriptions` de
    Regatta RC (migración `002_race_courses_and_access.sql`, columnas
    `plan`/`status`/`current_period_end`) ya tenía `unique(user_id)`
    desde el día uno.
- **Pendiente del lado del usuario, antes de que esto cobre de verdad**:
  1. Cargar en el entorno de producción de este sitio (Vercel):
     `MERCADOPAGO_ACCESS_TOKEN` (mismo valor que ya tiene `apps/web` de
     Coach Data), `MERCADOPAGO_REGATTARC_WEBHOOK_SECRET` (nueva, sale
     del dashboard de Mercado Pago recién al registrar la URL de abajo),
     `REGATTA_CR_SUPABASE_SERVICE_ROLE_KEY` (Settings → API del
     proyecto `cpcjljvdhotrtlflbdbd`).
  2. Registrar en el dashboard de Mercado Pago una nueva URL de webhook,
     `https://analytics.kalai.com.ar/api/webhooks/regattarc-mercadopago`,
     evento "Planes y suscripciones" — copiar la firma secreta que
     entrega a `MERCADOPAGO_REGATTARC_WEBHOOK_SECRET`.
  3. Probar de punta a punta con un pago real o el "Simular
     notificación" de Mercado Pago — nada de esto se probó todavía
     contra Mercado Pago real (mismo estado que tenía Coach Data antes
     de su primer pago de prueba).
- **Verificación de esta sesión**: `tsc --noEmit` limpio. No se pudo
  probar en el navegador — otra sesión de Claude Code ya tenía el
  dev server de este repo corriendo en el puerto 3002, y de todas
  formas hace falta login real para llegar a la tarjeta de
  Suscripciones (no se escribe la contraseña real del usuario, regla
  dura).

---

## 2026-08-16 — Eventos real + resto de las secciones descritas (algunas como placeholder)

- **Qué se hizo**: nueva ruta `/eventos/[id]` — Información general
  editable (nombre, descripción, fechas), Miembros (fundador + OR/
  Acreditador vía `event_memberships`, invitar/quitar/cambiar rol), y
  placeholders deshabilitados para Suscripciones/Entrenadores/
  Participantes/Calendario/Material (estos dos últimos con nota explícita
  de que dependen del schema de inscriptos de Regatta RC). Personal y
  Organización ganan una sección Eventos real (crear, listar, invitar por
  código/link) en vez del placeholder de la vuelta anterior — usa
  `kalai.create_event()` (ver CHANGELOG de Coach Data, migración 025).
  Organización gana además: Información general editable (nombre, tipo,
  descripción) y cards placeholder para Suscripciones/Clases/Alumnos/
  Material/Calendario, con el texto exacto que describió el usuario para
  cada una.
- **Por qué**: el usuario pidió avanzar con el resto de las pantallas
  descritas en la sesión de diseño de la IA, aunque las partes que
  dependen de Regatta RC (inscriptos/participantes) todavía no puedan
  funcionar de punta a punta — mejor tener la estructura general armada
  que esperar a que se destrabe todo.
- **Deliberadamente NO se hizo**: Clases/Alumnos/Material/Calendario de
  organización con datos reales (son placeholders, sin schema propio
  todavía — decisión explícita de no inventar un modelo de datos sin
  confirmarlo primero, mismo criterio que se usó para Eventos la vuelta
  pasada), Suscripciones a nivel organización/evento (no existe el
  concepto de entitlement no-personal en `subscriptions` todavía).

---

## 2026-08-16 — Landing Personal + restructure de rutas por workspace

- **Qué se hizo**: la organización deja de vivir en `/` — se muda a
  `/organizaciones/[id]`. `/` pasa a ser **Personal**: tarjeta de cuenta
  (nombre/email + link a `/perfil`), Suscripciones (Coach Data Pro real
  con link de compra a `kalai.com.ar/pro`, Regatta RC como
  "Próximamente"), Organizaciones (listado con link a cada una,
  invitaciones pendientes, crear, y un campo para pegar un código/link de
  invitación que redirige a `/invite/[token]`), y dos placeholders
  deshabilitados (Eventos, Análisis) — sin funcionalidad real todavía,
  documentado como tal. `/organizaciones/[id]` gana badge "Fundador" en
  Miembros y una acción nueva "Transferir administración principal"
  (llama a `kalai.transfer_org_ownership()`, ver CHANGELOG de Coach Data
  024) — visible solo para el fundador actual. Se agrega `/perfil`:
  editar nombre/teléfono/foto (bucket `avatars` ya existente), nota sobre
  medios de pago (no se guardan acá) y cambio de contraseña.
- **Por qué**: sesión de diseño de la IA completa del sitio de
  administración (Personal → Organización/Evento como workspaces
  separados, no páginas anidadas) — cada organización o evento al que se
  entra tiene que llevar a un dashboard propio con una vuelta explícita a
  "mi cuenta", no quedar mezclado en la misma pantalla.
- **Deliberadamente NO se hizo**: Eventos funcional (bloqueado por schema
  de Regatta RC, ver alcance de la versión anterior), botón de borrar
  organización en la UI (la policy ya lo permite para el fundador desde
  024, pero es destructivo y nadie lo pidió todavía), grilla de permisos
  por rol de staff (sigue siendo solo etiquetas).

---

## 2026-08-15 — Primera versión: organización + entrenadores

- **Qué se hizo**: scaffold completo del sitio (Next.js 16, sin
  dependencias de diseño, paleta blanca/teal propia — ver `CLAUDE.md`).
  Tres pantallas: login (contra el proyecto de Coach Data), home (crear
  organización o ver la propia + invitar entrenadores), aceptar
  invitación (`/invite/[token]`).
- **Por qué**: primer paso de la webapp de gestión de Kalai Analytics
  (Track B del roadmap a febrero) — a futuro esta va a ser la puerta de
  entrada pública a todo Kalai Analytics, hoy arranca por la parte de
  gestión de organización.
- **Alcance deliberadamente cortado**: sin envío de mail automático para
  invitaciones (se copia el link a mano), sin eventos/acreditación
  todavía (depende de schema que no existe en Regatta RC).
- **Probado de punta a punta** en preview local (`localhost:3002`): crear
  organización, invitar por email, aceptar con una segunda cuenta, y
  verse mutuamente en la lista de entrenadores. En el camino aparecieron
  varios bugs reales de RLS/permisos en el schema `kalai` (grants
  faltantes, recursión de policies, visibilidad de perfiles) — todos
  corregidos y documentados en el `CHANGELOG.md` de Coach Data
  (migraciones `019` a `022`).
- **Desplegado**: repo en `github.com/martincloos/management-site`,
  proyecto Vercel `kalai-analytics/management-site` (env vars de
  producción/preview cargadas), dominio propio `analytics.kalai.com.ar`
  (registro A → `76.76.21.21`) con HTTPS activo. Verificado en vivo.
