window.AEDT_CONFIG={
  SUPABASE_URL:"https://hqohxwdefpckyfdojwzc.supabase.co",
  SUPABASE_ANON_KEY:"sb_publishable_egJhvOn-kw6XLZQQM_X04g_EosxofnR"
};

window.AEDT = window.AEDT || {};

window.AEDT.getSupabaseClient = function(){
  const config = window.AEDT_CONFIG || {};
  const url = config.SUPABASE_URL || window.SUPABASE_URL || window.supabaseUrl || window.AEDT_SUPABASE_URL;
  const key = config.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY || window.supabaseAnonKey || window.AEDT_SUPABASE_ANON_KEY;
  if(!url || !key || !window.supabase){
    return null;
  }
  if(!window.aedtSupabase){
    window.aedtSupabase = window.supabase.createClient(url, key);
  }
  return window.aedtSupabase;
};

window.AEDT.hasSupabaseConfig = function(){
  const config = window.AEDT_CONFIG || {};
  return Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
};
