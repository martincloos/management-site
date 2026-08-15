import { createClient } from '@supabase/supabase-js'

// Un solo cliente — el schema `kalai` vive DENTRO del proyecto Supabase
// de Coach Data (no en un proyecto separado), así que login y datos de
// `kalai.*` pasan por acá mismo. Sin patrón de dos-clientes ni
// exchange-kalai-session: eso solo hace falta cuando el dato vive en OTRO
// proyecto (caso de Regatta RC).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const kalai = supabase.schema('kalai')
