// ── ENVIRONMENT CONFIGURATION ──
// Detects environment from URL query param or localStorage override.
//
// Switch environments:
//   ?env=dev        → dev Supabase project (nuihvxluxdpdjgkvtdih)
//   ?env=prod       → production Supabase project (mfjfcfuwjbhqgqmtmhwe)
//   ?env=local      → local Supabase (localhost:54321)
//
// The choice is persisted in localStorage so you don't need the
// query param on every page load. To reset: ?env=prod

(function () {
  var ENVIRONMENTS = {
    prod: {
      url: 'https://mfjfcfuwjbhqgqmtmhwe.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mamZjZnV3amJocWdxbXRtaHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE5NzYzMTYsImV4cCI6MjA1NzU1MjMxNn0.OYxDRBfsooHDY6prjI6R_7vJqqLCtlSMd_8mF-sLt0E'
    },
    dev: {
      url: 'https://nuihvxluxdpdjgkvtdih.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51aWh2eGx1eGRwZGpna3Z0ZGloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzg3NjMsImV4cCI6MjA4ODc1NDc2M30.5nev6WmtnpMI7uHwgaF_9Wi5XdUHaBJiUBdIQSgbtMY'
    },
    local: {
      url: 'http://127.0.0.1:54321',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
    }
  };

  // Check query param first, then localStorage, default to prod
  var params = new URLSearchParams(window.location.search);
  var envParam = params.get('env');

  if (envParam && ENVIRONMENTS[envParam]) {
    localStorage.setItem('healix_env', envParam);
  }

  // Default to dev when served from /dev/ path, otherwise prod
  var pathDefault = window.location.pathname.startsWith('/dev/') ? 'dev' : 'prod';
  var envName = envParam || localStorage.getItem('healix_env') || pathDefault;
  if (!ENVIRONMENTS[envName]) envName = 'prod';

  var env = ENVIRONMENTS[envName];

  // Expose globals (used by all pages)
  window.SUPABASE_URL = env.url;
  window.SUPABASE_ANON_KEY = env.anonKey;
  window.HEALIX_ENV = envName;

  // Log environment in dev mode
  if (envName !== 'prod') {
    console.log('[Healix] Environment: ' + envName + ' → ' + env.url);
  }
})();
