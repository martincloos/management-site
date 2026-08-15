# Management site — Contexto del proyecto

Webapp de gestión de Kalai Analytics — hoy solo organización + entrenadores
(crear organización, invitar por email, aceptar invitación). A futuro va a
ser la puerta de entrada pública a todo Kalai Analytics (quiénes somos, qué
hacemos, precios) — el diseño (blanco, simple, profesional, moderno) está
pensado para aguantar ese crecimiento sin rehacerse. Ver
`../KALAI-ANALYTICS.md` y `../ROADMAP.md` (Track B) para el contexto de
negocio completo.

## Antes de empezar a trabajar

Repo con historial en git. Antes de asumir en qué estado está, revisar
`git log --oneline -20` y [`CHANGELOG.md`](CHANGELOG.md).

## Identidad — la parte no obvia de este proyecto

**No hay proyecto Supabase propio.** Este sitio habla directo con el
proyecto de **Coach Data** (`nsrsoxuoxkeimixzarzi`), donde vive el schema
`kalai` (organizations/organization_members/invitations/event_memberships)
— ver migraciones `017_kalai_core_schema.sql` y `018_invitation_preview_policy.sql`
en `coach-data/supabase/migrations/`. Login y datos de `kalai.*` pasan por
el mismo `createClient()` (`src/lib/supabase.ts`) — a diferencia de
Regatta RC (proyecto separado), acá no hace falta ningún puente de
identidad. Detalle completo de por qué Kalai core vive adentro de Coach
Data (y no en un proyecto propio) en la memoria de Claude Code
`project_kalai_core_identity_migration` del otro repo.

**No crear una tabla `kalai.profiles` ni duplicar datos de perfil** — el
nombre/email de cada persona sale de `public.profiles` de Coach Data
(mismo proyecto, join directo).

## Stack

| Capa | Tecnología |
|---|---|
| Web | Next.js 16 (App Router) + TypeScript |
| Backend / DB | Supabase del proyecto de **Coach Data** (schema `kalai`) |

Sin Tailwind, sin `kalai-ui` (ese es el design system de la app mobile) —
CSS plano en `src/app/globals.css`. Paleta: blanco/gris claro, acento
`#0d9488` (teal real de la marca Kalai).

## Comandos

```bash
pnpm install
pnpm dev
pnpm typecheck
```

## Alcance actual (MVP) vs. futuro

**Hoy**: crear/ver organización propia, invitar entrenadores por email
(link para copiar y mandar a mano — sin envío automático de mail
todavía), aceptar invitación.

**Explícitamente fuera de alcance por ahora** (no construir sin que el
usuario lo pida): eventos/acreditación/check-in (depende de schema que
todavía no existe en Regatta RC — `event_entrants`, `checkin_windows` —
bloqueado por un CSV real de inscriptos del club), entitlements/billing
por organización, envío de mail transaccional para invitaciones, páginas
de marketing (quiénes somos/precios/fotos).

## Seguridad

Mismas reglas que el resto del workspace — ver `../Coach Pro Tracker/coach-data/CLAUDE.md`
y `../Regatta CR/regatta-cr/CLAUDE.md` para el detalle completo:

- Toda tabla nueva con RLS habilitado desde la misma migración que la crea.
- Escrituras sensibles vía RPC `security definer`, no policies de INSERT
  abiertas cuando el actor todavía no es miembro (ej. `kalai.accept_invitation`).
- Todo cambio de schema/RLS/función se anota en `CHANGELOG.md` **del repo
  de Coach Data** (ahí vive el schema `kalai`), no acá.
