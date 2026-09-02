# Changelog

Registro histórico de cambios importantes al proyecto, ordenado por fecha.
Mismo criterio que [Coach Data](../Coach%20Pro%20Tracker/coach-data/CHANGELOG.md)
y [Regatta RC](../Regatta%20CR/regatta-cr/CHANGELOG.md) — el schema `kalai`
que usa este sitio vive en el repo de Coach Data, así que los cambios de
schema/RLS/funciones se documentan **ahí**, no acá. Este changelog es para
decisiones propias de esta app (código, deploy, diseño).

---

## 2026-09-02 — Deploy: causa raíz encontrada (recursión del `prepare`), resuelta

El deploy del commit `a470599` ya **no** falló con
`ERR_PNPM_INVALID_VERSION_UNION` — ese arreglo funcionó. Falló con el
problema que estaba tapado detrás, y su log lo muestra entero.

- **Qué pasa**: Vercel ubica el store de pnpm **dentro del proyecto**
  (`Content-addressable store is at: /vercel/path0/.pnpm-store/v10`). El
  script `prepare` de `kalai-checkin` corre un `pnpm install` en un
  directorio temporal de ese store — o sea, dentro de este repo. Ese
  install camina hacia arriba buscando raíz de proyecto, encuentra la de
  `management-site`, y **reinstala este sitio entero**, lo que vuelve a
  preparar `kalai-checkin`, que vuelve a correr `pnpm install`…
- **Cómo se ve en el log**: nueve niveles de `pnpm install` anidados
  (`_98`, `_111`, `_124`, `_137`, `_150`, `_163`, `_176`, `_189`, `_202`,
  `_215`), **349 paquetes resueltos por nivel** — que son los de este
  sitio, no los del paquete. Termina cuando dos ramas paralelas escriben
  el mismo archivo del virtual store y saltan dos `ERR_PNPM_EEXIST`
  seguidos, luego `ERR_PNPM_PREPARE_PACKAGE`.
- **Por qué nunca se reprodujo localmente**: en una máquina de desarrollo
  el store de pnpm vive fuera del proyecto (en el perfil del usuario), así
  que el install anidado no encuentra ninguna raíz de la que colgarse y
  termina en segundos. Es un problema exclusivo de cómo Vercel configura
  el store.
- **Y por qué el equipo lo leyó como "caché corrupta"**: los reintentos
  con la caché destildada seguían fallando porque la causa nunca fue la
  caché — era determinística, y se disparaba en todo deploy que tuviera
  que preparar el paquete.
- **Arreglo**: `kalai-checkin` deja de compilarse al instalarse. Ahora
  publica `dist/` ya compilado y **no tiene script `prepare`** (ver su
  CHANGELOG). Este repo lo consume pineado al SHA `5cb1b4e` y se le sacó
  la entrada de `allowBuilds`: el paquete no ejecuta nada al instalarse,
  así que no necesita permiso de build.
- **Efecto de yapa**: la mitad declarante del paquete es React Native. Con
  el `prepare` puesto, este sitio web habría tenido que instalar React
  Native (y `kalai-ui`, otra dependencia git con su propio `prepare`) en
  cada deploy solo para compilar un componente que nunca importa. Ya no.
- **El pin `packageManager` queda**, aunque ya no es imprescindible: sin
  la clave `nombre@URL` en `allowBuilds` desaparece el bug de parseo de
  pnpm 10.2x. Se mantiene por reproducibilidad del build.
- **Verificado local**: install con `node_modules/kalai-checkin` borrado
  baja el paquete ya compilado en **6,6 s** sin ejecutar ningún script y
  sin traer React Native; `--frozen-lockfile` en sync; `pnpm typecheck` y
  `pnpm build` limpios.

## 2026-09-02 — Deploy: diagnóstico real del ERR_PNPM_INVALID_VERSION_UNION

⚠️ **Esta entrada corrige la del 2026-09-01 de abajo ("caché de
dependencias corrupta"), cuya conclusión era equivocada.** No era la
caché de Vercel.

- **Causa real**: la clave de `allowBuilds` en `pnpm-workspace.yaml` tiene
  forma `nombre@URL`. Las versiones de pnpm del rango 10.2x leen lo que
  sigue al `@` como número de versión, se encuentran una URL y abortan con
  `ERR_PNPM_INVALID_VERSION_UNION`. Vercel elegía la versión de pnpm por su
  cuenta y le tocaba una del rango roto.
- **Reproducido en aislamiento** (proyecto desechable, misma dependencia
  git, misma clave), variando solo la versión de pnpm: **10.11.1 ok,
  10.28.2 rompe con el error idéntico palabra por palabra, 10.34.5 ok,
  11.24.0 ok**. Y con 10.28.2 fijo, variando solo el
  `pnpm-workspace.yaml`: con la clave completa rompe, sin la clave
  instala limpio.
- **Por qué el pin es obligatorio y no cosmético**: pnpm 10.34.5 *exige* la
  clave completa para dependencias git (con el nombre solo falla con
  `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`, y la forma `git+https://...`
  tampoco le sirve — quiere la URL de tarball de codeload). O sea: no
  existe un formato de clave que le sirva a 10.34.5 *y* a 10.2x. **El pin
  `packageManager` es lo único que evita que Vercel vuelva a elegir una
  versión rota. No sacarlo.**
- **Por qué no se veía localmente**: el paquete ya compilado estaba en el
  store de pnpm de la máquina, así que el chequeo de permiso de build
  nunca se ejecutaba. Recién al cambiar la URL del repo (ver abajo) se
  invalidó ese store y apareció el problema real.
- **De paso**: `kalai-checkin` fue transferido a
  `github.com/martincloos/kalai-checkin` y es **público**. Se actualizó la
  URL de la dependencia y la clave de `allowBuilds`. El lockfile ahora
  resuelve por tarball de codeload **con hash de integridad**, que la
  resolución git anterior no tenía.
- **Verificado local**: `pnpm install` con `node_modules/kalai-checkin`
  borrado (fuerza el `prepare` real) compila el paquete;
  `pnpm install --frozen-lockfile` en sync; `pnpm typecheck` y
  `pnpm build` limpios (build corrido con env ficticias en memoria, el
  sitio sigue sin poder buildearse en esta máquina por falta de
  `.env.local`).
- ⚠️ **Sigue abierto, es OTRO problema**: el deploy del 2026-09-01 con el
  pin puesto reportó *15+ minutos en un loop de instalaciones anidadas del
  `prepare` de kalai-checkin*. Eso no lo arregla este commit — se sabrá en
  el próximo deploy. Si vuelve a pasar, la salida de fondo es que
  `kalai-checkin` deje de necesitar build al instalarse (publicar `dist/`
  compilado en vez de fuente TS), lo que elimina de una la clave de
  `allowBuilds`, el pin y el loop.

## 2026-09-01 — Deploy en Vercel: caché de dependencias corrupta (CONCLUSIÓN ERRÓNEA, ver entrada de arriba)

- **Qué pasó**: los primeros 3 deploys del commit `b385583` fallaron con
  `ERR_PNPM_INVALID_VERSION_UNION` sobre `kalai-checkin`, incluso con
  "Use existing Build Cache" destildado en la UI de Vercel — el log seguía
  mostrando el mismo `Restored build cache from previous deployment
  (BvGVSVmT25YVx2V1yCY2u283W1wX)` en los tres casos.
- **Verificado que NO es un problema del repo**: se instaló el lockfile de
  ese commit exacto dos veces en aislamiento total (clon nuevo +
  `--store-dir` vacío, sin nada de la máquina de por medio) con
  `pnpm@10.34.5 --frozen-lockfile` — las dos veces funcionó limpio.
- **Este commit es la prueba**: un commit genuinamente nuevo (no un
  "Redeploy" de uno que ya falló) para ver si Vercel arranca una cadena de
  build distinta, sin la caché envenenada asociada a esa lista de
  deployments.

## 2026-09-01 — Integra la pantalla de Ventanas de check-in (Fase 2)

- **Qué se hizo**: se agrega `kalai-checkin` como dependencia git pineada a
  un SHA (`git+https://github.com/fgentile123/kalai-checkin.git#cbef3fe...`,
  mismo mecanismo que `kalai-ui` en `coach-data`) y se renderiza
  `<VentanasSection>` (de `kalai-checkin/staff`) en
  `eventos/[id]/page.tsx`, después de las secciones de Participantes y
  Entrenadores. Permite al staff dar de alta clases del evento a mano y
  crear/editar/borrar ventanas de check-in (Salida/Regreso por clase y
  día).
- **`allowBuilds` en `pnpm-workspace.yaml`**: el paquete se distribuye como
  fuente TS sin compilar y corre `tsc` al instalarse — hace falta declarar
  la clave completa (no alcanza con el nombre solo, a diferencia de las
  dependencias del registry). ⚠️ **Corregido el 2026-09-02**: la forma
  `kalai-checkin@git+https://...#sha` que se usó acá es la que rompe el
  deploy en pnpm 10.2x, y además pnpm 10.34.5 tampoco la acepta — la forma
  correcta es la URL de tarball de codeload. Ver entrada del 2026-09-02.
- **`canEdit` del check-in usa su propio criterio de staff** (decisión D4):
  admin + secretario + acreditador, no `{admin, secretario}` como el resto
  del roster — el acreditador no gestiona roster pero sí ventanas.
- **De paso**: se resolvió un `allowBuilds: unrs-resolver` que había
  quedado como TODO sin definir en `pnpm-workspace.yaml` (bloqueaba
  `pnpm typecheck`/`pnpm build` con `ERR_PNPM_IGNORED_BUILDS`) — se fijó en
  `false`, es un resolver de tooling de ESLint, no hace falta su build
  nativo.
- **Verificado en el navegador real (Playwright headless)**: signup de una
  cuenta de prueba (`claude-smoke-test-*@example.com`, el proyecto no exige
  confirmación de email), creación de un evento descartable, y ciclo
  completo dentro de la tarjeta de Ventanas — dar de alta una clase, crear
  una ventana (aparece con badge "Abierta" bien calculado), editar su hora
  de fin, y borrarla. Cero errores de consola en todo el recorrido. Se
  encontró y corrigió al probar: `createCheckinWindow` no mandaba
  `created_by`, quedaba `null` (columna nullable, no rompía nada, pero el
  módulo existe justamente para trazabilidad — ver fix en el CHANGELOG de
  `kalai-checkin`). Cuenta y evento de prueba borrados al terminar — no
  queda nada en la base real salvo la cuenta de auth huérfana
  (`claude-smoke-test-*@example.com`, sin organización ni evento
  asociado, inofensiva).
- `pnpm typecheck` y `pnpm build` (Next.js/Turbopack) compilan limpio. El
  build completo del sitio falla en esta máquina por falta de otras
  variables de entorno (Mercado Pago, Regatta CR) no relacionadas con este
  cambio.

---

## 2026-08-26 — Módulo de check-in: impacto pendiente sobre este sitio

Todavía **no hay cambios de código acá** — esta entrada registra lo que
viene, porque el módulo de check-in (repo nuevo `kalai-checkin`, schema en
las migraciones `035`–`038` de Coach Data, originalmente escritas como
`029`–`032` y renumeradas por una colisión con otro trabajo — ver
CHANGELOG de `coach-data`) cambia cosas que este sitio ya usa. Ver
`../CHECKIN-FASE0-RELEVAMIENTO.md` para el detalle.

- **`kalai.event_entrants` pasó a ser "una fila por BARCO"** (antes: una
  fila por persona). La migración `035` es aditiva — no borra ninguna
  columna, así que `RosterSection.tsx` sigue leyendo `full_name`, `class` y
  `club` como antes y **no se rompe**. Pero las columnas nuevas
  (`class_id`, `club_id`) quedan vacías en todo lo que se cargue desde acá
  hasta que se adapte el importador (Fase 5 del plan de check-in), y un
  barco sin `class_id` no puede aparecer en ninguna ventana de check-in.
- ⚠️ **La RLS de `event_entrants` y `event_coaches` se endureció**
  (migración `036`). Antes, cualquier miembro del evento leía el roster
  completo; ahora la vista global es exclusiva del staff (admin /
  secretario / acreditador) y quien solo declara ve únicamente sus barcos.
  Efecto para este sitio: **un usuario con rol `or` (Oficial de Regata)
  deja de ver las secciones de Participantes y Entrenadores** del evento.
  Es intencional.
- **La escritura del roster se amplió** de `{admin, secretario}` a los tres
  roles de staff — el acreditador ahora también puede cargar y corregir.
- **Lo que va a vivir acá**: las pantallas de staff del módulo
  (configuración de ventanas, import de CSV, asignación entrenador↔barco y
  la tabla de control) se renderizan **dentro de este sitio**, consumidas
  desde el paquete `kalai-checkin` — para no tener dos webapps de staff con
  dos logins. También va acá la ruta de servidor del invite de altas, que
  es la única que necesita la service-role key.

## 2026-08-19 — Corrección: el webhook de Regatta RC Pro se muda al proyecto de Regatta RC

- **Qué se hizo**: se borran `src/lib/regattaAdmin.ts` y
  `src/app/api/webhooks/regattarc-mercadopago/` de este repo. Esa
  lógica pasa a `supabase/functions/regattarc-mercadopago-webhook/` del
  repo de **regatta-cr** (ver su CHANGELOG). `api/checkout/regattarc`
  (que arma el pago) no cambia — solo el webhook que lo confirma.
- **Por qué**: la primera versión guardaba acá la `service_role` del
  proyecto Supabase de Regatta RC (`REGATTA_CR_SUPABASE_SERVICE_ROLE_KEY`)
  para que el webhook pudiera escribir `subscriptions` — viola la regla
  explícita de ese proyecto ("no service_role key de un proyecto
  circulando en el otro") y amplía sin necesidad el radio de explosión
  de un secreto con escritura total sobre esa base a un tercer repo.
  Encontrado en revisión de código antes de configurar los secrets en
  producción — nunca llegó a estar expuesto en vivo. Sin cambios para
  el usuario, sigue comprando desde acá.

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
