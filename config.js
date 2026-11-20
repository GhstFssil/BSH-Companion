// Supabase connection for the BLOODSOUP HELL app.
// Both values are PUBLIC by design (they ship in the app). Security comes from the
// row-level-security rules in supabase/schema.sql, not from hiding these.
// NEVER put a "service_role" or "secret" key in this file.
window.BSH_CONFIG = {
  supabaseUrl: 'https://gncvcjotrtwegrxtsttu.supabase.co',
  supabaseKey: 'sb_publishable_JxtoBDCEOfYSvXPBTphyvw_sYFiLMUY'
};
