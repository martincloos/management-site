# Changelog

Registro histórico de cambios importantes al proyecto, ordenado por fecha.
Mismo criterio que [Coach Data](../Coach%20Pro%20Tracker/coach-data/CHANGELOG.md)
y [Regatta RC](../Regatta%20CR/regatta-cr/CHANGELOG.md) — el schema `kalai`
que usa este sitio vive en el repo de Coach Data, así que los cambios de
schema/RLS/funciones se documentan **ahí**, no acá. Este changelog es para
decisiones propias de esta app (código, deploy, diseño).

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
