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
