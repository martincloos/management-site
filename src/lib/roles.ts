// Roles de organización — por ahora son etiquetas (mismo permiso que
// "coach" salvo admin), sin grilla de permisos propia todavía. Ver
// CHANGELOG de Coach Data, migración 023.
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  coach: 'Coach',
  head_coach: 'Head Coach',
  coordinador: 'Coordinador',
  acreditador: 'Acreditador',
  secretario: 'Secretario',
}

export const INVITABLE_ROLES = ['coach', 'head_coach', 'coordinador', 'acreditador', 'secretario', 'admin']

// Roles de evento — distintos de los de organización (event_memberships,
// no organization_members). "Acreditador" existe en los dos niveles, se
// distingue por dónde se invita, no por el texto del rol (ver
// accept_invitation en 023). "Admin" y "Secretario" agregados en 026:
// admin delegado tiene los mismos permisos que el fundador; secretario
// puede gestionar participantes/entrenadores pero no info general ni
// miembros (ver policies de event_entrants/event_coaches).
export const EVENT_ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  or: 'Oficial de Regata',
  secretario: 'Secretario',
  acreditador: 'Acreditador',
}

export const EVENT_INVITABLE_ROLES = ['admin', 'or', 'secretario', 'acreditador']
