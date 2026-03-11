// ── SUPABASE ──
// SUPABASE_URL and SUPABASE_ANON_KEY are set by config.js (loaded before this file)

var currentUser = null, currentSession = null, currentTimeframe = 7;

function getSession() {
  try { var s = localStorage.getItem('healix_session'); return s ? JSON.parse(s) : null; } catch(e) { return null; }
}

// ── LOGOUT ──
function logout() {
  var session = getSession();
  if (session && session.access_token) {
    fetch(SUPABASE_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + session.access_token
      }
    }).catch(function() {});
  }
  localStorage.removeItem('healix_session');
  localStorage.removeItem('healix_last_activity');
  window.location.href = 'login.html';
}

// ── TOKEN REFRESH ──
function refreshSession() {
  var session = getSession();
  if (!session || !session.refresh_token) return Promise.reject('No refresh token');
  return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify({ refresh_token: session.refresh_token })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.access_token) {
      localStorage.setItem('healix_session', JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        user: data.user || session.user
      }));
      if (currentSession) currentSession.access_token = data.access_token;
      return data.access_token;
    }
    throw new Error('Refresh failed');
  });
}

// Proactively refresh token every 50 minutes (Supabase tokens expire in 60 min)
setInterval(function() {
  var session = getSession();
  if (session && session.refresh_token) {
    refreshSession().catch(function() { logout(); });
  }
}, 50 * 60 * 1000);

// ── SESSION INACTIVITY TIMEOUT (30 min) ──
var INACTIVITY_TIMEOUT = 30 * 60 * 1000;
function resetActivityTimer() {
  localStorage.setItem('healix_last_activity', Date.now().toString());
}
function checkInactivity() {
  var last = parseInt(localStorage.getItem('healix_last_activity') || '0', 10);
  if (last && (Date.now() - last > INACTIVITY_TIMEOUT)) {
    logout();
  }
}
['click', 'keydown', 'scroll', 'mousemove', 'touchstart'].forEach(function(evt) {
  document.addEventListener(evt, resetActivityTimer, { passive: true });
});
resetActivityTimer();
setInterval(checkInactivity, 60 * 1000);

function supabaseRequest(endpoint, method, body, token, extraHeaders) {
  var headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + (token || SUPABASE_ANON_KEY)
  };
  if (extraHeaders) { Object.keys(extraHeaders).forEach(function(k) { headers[k] = extraHeaders[k]; }); }
  return fetch(SUPABASE_URL + endpoint, {
    method: method || 'GET',
    headers: headers,
    body: body ? JSON.stringify(body) : undefined
  }).then(function(r) {
    if (!r.ok) return r.text().then(function(t) { throw new Error(r.status + ': ' + t); });
    var ct = r.headers.get('content-type') || '';
    if (ct.indexOf('json') === -1) return null;
    return r.text().then(function(t) { return t ? JSON.parse(t) : null; });
  });
}

// ── AUTH ──
async function init() {
  var session = getSession();
  if (!session || !session.access_token) { window.location.href = 'login.html'; return; }
  currentSession = session;
  try {
    var user = await supabaseRequest('/auth/v1/user', 'GET', null, session.access_token);
    if (!user || !user.id) { localStorage.removeItem('healix_session'); window.location.href = 'login.html'; return; }
    currentUser = user;
    // Set initial name from auth metadata, will be overwritten by profile data if available
    var name = (user.user_metadata && user.user_metadata.full_name) || user.email.split('@')[0];
    var firstName = name.split(' ')[0];
    document.getElementById('sb-name').textContent = name;
    document.getElementById('sb-avatar').textContent = firstName.charAt(0).toUpperCase();
    document.getElementById('page-title').textContent = greet() + ', ' + firstName;

    // Fetch profile from Supabase before loading dashboard so DOB/weight are available
    try {
      var profileData = await supabaseRequest(
        '/rest/v1/profiles?auth_user_id=eq.' + user.id + '&limit=1',
        'GET', null, session.access_token
      );
      if (profileData && Array.isArray(profileData) && profileData.length > 0) {
        window.userProfileData = profileData[0];
        console.log('[Healix] profile loaded:', Object.keys(window.userProfileData), 'birth_date:', window.userProfileData.birth_date);
        populateProfileForm(profileData[0]);
        // Update sidebar and greeting with profile name
        var profileName = [profileData[0].first_name, profileData[0].last_name].filter(Boolean).join(' ');
        if (profileName) {
          document.getElementById('sb-name').textContent = profileName;
          document.getElementById('sb-avatar').textContent = profileName.charAt(0).toUpperCase();
          document.getElementById('page-title').textContent = greet() + ', ' + profileData[0].first_name;
        }
      } else {
        // No profile row exists — create one so PATCH calls work later
        var fullName = (user.user_metadata && user.user_metadata.full_name) || '';
        var nameParts = fullName.split(' ');
        try {
          await supabaseRequest('/rest/v1/profiles', 'POST', {
            auth_user_id: user.id,
            first_name: nameParts[0] || '',
            last_name: nameParts.slice(1).join(' ') || '',
            email: user.email || ''
          }, session.access_token, { 'Prefer': 'return=representation' });
          console.log('[Healix] profile row created for new user');
          // Re-fetch so userProfileData is populated
          var newProfile = await supabaseRequest(
            '/rest/v1/profiles?auth_user_id=eq.' + user.id + '&limit=1',
            'GET', null, session.access_token
          );
          if (newProfile && newProfile.length > 0) {
            window.userProfileData = newProfile[0];
            populateProfileForm(newProfile[0]);
          }
        } catch(e) { console.warn('Profile creation error:', e); }
      }
    } catch(e) { console.warn('Profile fetch error:', e); }

    loadMedicalProfileUI();

    // Render from cache instantly, then refresh from server
    try {
      var cached = localStorage.getItem('healix_dashboard_cache');
      if (cached) {
        var c = JSON.parse(cached);
        // Use cache if less than 10 minutes old
        if (c.cachedAt && (Date.now() - c.cachedAt < 10 * 60 * 1000)) {
          renderVitalityAge(c.result, c.realAge);
          renderDriverCards(c.metrics, c.result);
          if (c.timestamps) {
            renderFreshnessIndicator('drv-heart-freshness', 'heart_rate', c.timestamps.heart_rate);
            renderFreshnessIndicator('drv-sleep-freshness', 'sleep', c.timestamps.sleep);
            renderFreshnessIndicator('drv-weight-freshness', 'weight', c.timestamps.weight);
            renderFreshnessIndicator('drv-strength-freshness', 'strength', c.timestamps.strength);
            renderFreshnessIndicator('drv-aerobic-freshness', 'vo2max', c.timestamps.vo2max);
            renderFreshnessIndicator('drv-bloodwork-freshness', 'bloodwork', c.timestamps.bloodwork);
          }
        }
      }
    } catch(e) { /* cache parse error, ignore */ }

    loadDashboardData();
    loadFamilyHistoryForm();
    setWeightDateDefault();
  } catch(e) { console.error('Auth error:', e); }
}

function greet() {
  var h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// ── PAGE NAV ──
var pageTitles = { dashboard: 'Dashboard', meals: 'Meals', documents: 'Documents', strength: 'Strength Log', profile: 'Profile & Settings' };
function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  if (currentUser) {
    var name = (currentUser.user_metadata && currentUser.user_metadata.full_name) || currentUser.email.split('@')[0];
    var firstName = name.split(' ')[0];
    document.getElementById('page-title').textContent = id === 'dashboard' ? greet() + ', ' + firstName : pageTitles[id] || id;
  }

  // Load page data
  if (id === 'meals') { loadMealsPage(); }
  if (id === 'documents') loadDocumentsPage();
  if (id === 'strength') renderStrengthPage();
}

// ── DATA FRESHNESS ──
var FRESHNESS_THRESHOLDS = {
  heart_rate:  { fresh: 24, warning: 48, stale: 72 },
  sleep:       { fresh: 36, warning: 60, stale: 96 },
  steps:       { fresh: 18, warning: 36, stale: 72 },
  weight:      { fresh: 168, warning: 504, stale: 720 },
  strength:    { fresh: 720, warning: 2160, stale: 4320 },
  vo2max:      { fresh: 720, warning: 2160, stale: 4320 },
  bloodwork:   { fresh: 2160, warning: 4320, stale: 8760 }
};

var FRESHNESS_CTA = {
  heart_rate: { text: 'Open HealthBite to sync', href: null },
  sleep:      { text: 'Open HealthBite to sync', href: null },
  steps:      { text: 'Open HealthBite to sync', href: null },
  weight:     { text: 'Log new weight', action: function() { openModal('weight-modal'); } },
  strength:   { text: 'Log a new test', action: function() { showPage('strength', null); } },
  vo2max:     { text: 'Log a new test', action: function() { showPage('strength', null); } },
  bloodwork:  { text: 'Upload new labs', action: function() { showPage('documents', null); } }
};

function getFreshnessLevel(metricKey, timestamp) {
  if (!timestamp) return null;
  var thresholds = FRESHNESS_THRESHOLDS[metricKey];
  if (!thresholds) return null;
  var hoursAgo = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60);
  if (hoursAgo <= thresholds.fresh) return 'fresh';
  if (hoursAgo <= thresholds.warning) return 'warning';
  return 'stale';
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  var ms = Date.now() - new Date(timestamp).getTime();
  var mins = Math.floor(ms / 60000);
  if (mins < 60) return mins + 'm ago';
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  var days = Math.floor(hours / 24);
  if (days < 14) return days + 'd ago';
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderFreshnessIndicator(elementId, metricKey, timestamp) {
  var el = document.getElementById(elementId);
  if (!el) return;
  if (!timestamp) { el.innerHTML = ''; return; }
  var level = getFreshnessLevel(metricKey, timestamp);
  if (!level || level === 'fresh') {
    el.innerHTML = '<span class="freshness-dot fresh"></span><span class="freshness-text">' + formatRelativeTime(timestamp) + '</span>';
    return;
  }
  var timeText = formatRelativeTime(timestamp);
  var html = '<span class="freshness-dot ' + level + '"></span><span class="freshness-text">' + timeText;
  if (level === 'stale') {
    var cta = FRESHNESS_CTA[metricKey];
    if (cta) {
      html += ' · <span class="freshness-cta" onclick="event.stopPropagation()">' + cta.text + '</span>';
    }
  }
  html += '</span>';
  el.innerHTML = html;

  // Attach CTA click handler
  if (level === 'stale') {
    var ctaEl = el.querySelector('.freshness-cta');
    var ctaDef = FRESHNESS_CTA[metricKey];
    if (ctaEl && ctaDef && ctaDef.action) {
      ctaEl.onclick = function(e) { e.stopPropagation(); ctaDef.action(); };
    }
  }

  // Add stale card treatment
  var card = el.closest('.driver-card');
  if (card) {
    card.classList.toggle('data-stale', level === 'stale');
  }
}

function renderSyncBanner(timestamps) {
  var banner = document.getElementById('sync-banner');
  if (!banner) return;
  var hkMetrics = ['heart_rate', 'sleep', 'steps'];
  var allStale = hkMetrics.every(function(key) {
    var ts = timestamps[key];
    if (!ts) return true;
    var level = getFreshnessLevel(key, ts);
    return level === 'warning' || level === 'stale';
  });
  banner.classList.toggle('visible', allStale);
  if (allStale) {
    var textEl = document.getElementById('sync-banner-text');
    if (textEl) {
      // Query health_sync_log for last sync info
      supabaseRequest(
        '/rest/v1/health_sync_log?select=sync_completed_at,device_name&user_id=eq.' + currentUser.id
        + '&sync_status=eq.completed&order=sync_completed_at.desc&limit=1',
        'GET', null, currentSession.access_token
      ).then(function(rows) {
        if (rows && rows.length > 0 && rows[0].sync_completed_at) {
          var ago = formatRelativeTime(rows[0].sync_completed_at);
          var device = rows[0].device_name ? ' from ' + rows[0].device_name : '';
          textEl.textContent = 'Last sync ' + ago + device + '. Open HealthBite to refresh your data.';
        }
      }).catch(function() {});
    }
  }
}

function renderVitalityConfidence(timestamps) {
  var el = document.getElementById('va-confidence');
  if (!el) return;
  var keys = ['heart_rate', 'sleep', 'steps', 'weight', 'strength', 'vo2max', 'bloodwork'];
  var maxHours = 0;
  var staleCount = 0;
  keys.forEach(function(key) {
    if (!timestamps[key]) return;
    var hours = (Date.now() - new Date(timestamps[key]).getTime()) / (1000 * 60 * 60);
    if (hours > maxHours) maxHours = hours;
    var level = getFreshnessLevel(key, timestamps[key]);
    if (level === 'warning' || level === 'stale') staleCount++;
  });
  if (staleCount === 0) {
    el.textContent = '';
    el.className = 'vitality-confidence';
    return;
  }
  if (maxHours > 168) {
    el.textContent = 'Some data is over a week old \u2014 scores may not reflect current health';
    el.className = 'vitality-confidence amber';
  } else {
    var daysOld = Math.ceil(maxHours / 24);
    el.textContent = 'Based on data up to ' + daysOld + ' day' + (daysOld > 1 ? 's' : '') + ' old';
    el.className = 'vitality-confidence';
  }
}

// ── LOAD DASHBOARD DATA ──
// ── VITALITY AGE CALCULATION ──
// Clinical model based on PhenoAge / cardiology research
// Biomarkers only — habits are inputs, not outputs
//
// Weights (when all data present):
//   Blood work:   40%  — most objective biological age signal
//   Resting HR:   25%  — strongest single cardio mortality predictor
//   Weight (BMI): 20%  — metabolic health proxy
//   Strength:     10%  — functional capacity / muscle mass
//   Aerobic:       5%  — VO2 max from fitness test
//
// Until blood work connected, HR/weight/strength/aerobic redistribute proportionally.

function scoreHR(hr) {
  // Mortality-calibrated Gaussian curve (Copenhagen Heart Study, UK Biobank, HUNT)
  // Optimal zone 50-62 bpm; σ ≈ 15 bpm outside optimal band
  if (hr < 40) return 65; // extreme bradycardia — uncertainty flag
  if (hr >= 50 && hr <= 62) return 100; // optimal zone
  var center = hr < 50 ? 50 : 62;
  var sigma = 15;
  var z = (hr - center) / sigma;
  return Math.max(5, Math.round(100 * Math.exp(-0.5 * z * z)));
}

function scoreWeight(weightKg, heightCm) {
  // BMI-based J-shaped mortality scoring (Global BMI Mortality Collaboration)
  if (!weightKg || !heightCm) return null;
  var bmi = weightKg / Math.pow(heightCm / 100, 2);
  if (bmi < 16.5) return 10;
  if (bmi < 18.5) return 45;
  if (bmi < 20)   return 80;
  if (bmi <= 25)   return 95;  // optimal
  if (bmi <= 27.5) return 78;
  if (bmi <= 30)   return 60;
  if (bmi <= 35)   return 38;
  if (bmi <= 40)   return 20;
  return 10;
}

function scoreStrength(strengthData) {
  // Fitness test percentile average — percentile maps directly to 0-100 score
  if (!strengthData) return null;
  return strengthData.avgPercentile || 50;
}

function scoreVO2(vo2, profile) {
  // Score VO2 max using fitness test percentile norms
  // Returns 0-100 based on age/sex percentile
  if (!vo2 || vo2 <= 0) return null;
  var norm = FITNESS_NORMS && FITNESS_NORMS.vo2max;
  if (!norm) return Math.min(100, Math.max(10, Math.round(vo2 * 2)));
  var sex = (profile && profile.sex) || 'male';
  var age = (profile && profile.age) || 35;
  var bracket = age < 30 ? '18-29' : age < 40 ? '30-39' : age < 50 ? '40-49' : age < 60 ? '50-59' : '60+';
  var table = (norm.norms[sex] || norm.norms.male || {})[bracket];
  if (!table) return Math.min(100, Math.max(10, Math.round(vo2 * 2)));
  // table is [[threshold, percentile], ...] sorted desc by threshold
  for (var i = 0; i < table.length; i++) {
    if (vo2 >= table[i][0]) return table[i][1];
  }
  return 5;
}

function scoreSleep(sleepData) {
  // Reweighted sleep scoring with asymmetric duration curve (Windred et al. 2023)
  // Oversleeping penalized more than undersleeping (9h RR 1.21 vs 5h RR 1.04)
  if (!sleepData || !sleepData.nights) return null;

  // Duration score (0-35): Asymmetric curve, nadir at 6.5-7.5h
  var dur = sleepData.avg;
  var durScore;
  if (dur >= 6.5 && dur <= 7.5) durScore = 35;       // optimal nadir
  else if (dur >= 6 && dur < 6.5) durScore = 28;      // slightly short
  else if (dur > 7.5 && dur <= 8) durScore = 30;      // slightly long
  else if (dur >= 5.5 && dur < 6) durScore = 20;      // short
  else if (dur > 8 && dur <= 8.5) durScore = 22;      // long
  else if (dur >= 5 && dur < 5.5) durScore = 12;      // very short
  else if (dur > 8.5 && dur <= 9) durScore = 14;      // very long — penalized more
  else if (dur > 9) durScore = 5;                      // extreme long — highest risk
  else durScore = 5;                                   // extreme short (<5h)

  // Debt score (0-30): Accumulated sleep debt
  var debt = sleepData.debt || 0;
  var debtScore;
  if (debt <= 1) debtScore = 30;
  else if (debt <= 3) debtScore = 22;
  else if (debt <= 7) debtScore = 13;
  else if (debt <= 14) debtScore = 5;
  else debtScore = 0;

  // Consistency score (0-35): Major weight increase per Windred et al. 2023
  var consScore = Math.min(35, Math.round((sleepData.nights / 7) * 35));

  return durScore + debtScore + consScore;
}

function scoreBloodwork(bw) {
  // Returns 0-100 composite or null if no data
  // U-shaped risk curves for biomarkers where clinically appropriate
  if (!bw || Object.keys(bw).length === 0) return null;
  var pts = [];
  if (bw.glucose != null) {
    // U-shaped: hypoglycemia risk below 70, optimal 70-85, escalating risk above
    if (bw.glucose < 70) pts.push(65);
    else if (bw.glucose < 85) pts.push(100);
    else if (bw.glucose < 100) pts.push(78);
    else if (bw.glucose < 126) pts.push(40);
    else pts.push(10);
  }
  if (bw.hba1c != null) {
    // U-shaped: low HbA1c (<4.6) associated with increased mortality
    if (bw.hba1c < 4.6) pts.push(85);
    else if (bw.hba1c < 5.4) pts.push(100);
    else if (bw.hba1c < 5.7) pts.push(75);
    else if (bw.hba1c < 6.5) pts.push(40);
    else pts.push(10);
  }
  if (bw.ldl != null) {
    // AHA high-risk target <70; more granular tiers
    if (bw.ldl < 70) pts.push(100);
    else if (bw.ldl < 100) pts.push(90);
    else if (bw.ldl < 130) pts.push(70);
    else if (bw.ldl < 160) pts.push(45);
    else if (bw.ldl < 190) pts.push(25);
    else pts.push(10);
  }
  if (bw.hdl != null) {
    // Ceiling at 90 — paradoxical mortality increase above 90 mg/dL
    if (bw.hdl > 90) pts.push(78);
    else if (bw.hdl >= 60) pts.push(100);
    else if (bw.hdl >= 40) pts.push(70);
    else pts.push(30);
  }
  if (bw.crp != null) {
    // hs-CRP inflammation marker
    if (bw.crp < 0.5) pts.push(100);
    else if (bw.crp < 1.0) pts.push(85);
    else if (bw.crp < 2.0) pts.push(65);
    else if (bw.crp < 3.0) pts.push(40);
    else pts.push(15);
  }
  if (bw.triglycerides != null) {
    // AHA optimal <100
    if (bw.triglycerides < 100) pts.push(100);
    else if (bw.triglycerides < 150) pts.push(80);
    else if (bw.triglycerides < 200) pts.push(55);
    else if (bw.triglycerides < 500) pts.push(25);
    else pts.push(10);
  }
  if (pts.length === 0) return null;
  return Math.round(pts.reduce(function(a, b) { return a + b; }, 0) / pts.length);
}

function calcVitalityAge(metrics) {
  var realAge = metrics.realAge || 35;
  var scores = [];

  // Blood work — 40% when available, redistributed when not
  var bwScore = scoreBloodwork(metrics.bloodwork);
  if (bwScore !== null) {
    scores.push({ name: 'bloodwork', label: 'Blood Work', score: bwScore, weight: 0.40 });
  }

  // Resting HR — 25% (or 42% without bloodwork)
  if (metrics.hr !== null) {
    scores.push({ name: 'hr', label: 'Heart Rate', score: scoreHR(metrics.hr), weight: 0.25 });
  }

  // Weight (BMI) — 20% (or 33% without bloodwork)
  if (metrics.weightScore !== null) {
    scores.push({ name: 'weight', label: 'Weight', score: metrics.weightScore, weight: 0.20 });
  }

  // Strength — 10% (or 17% without bloodwork)
  var strScore = scoreStrength(metrics.strengthData);
  if (strScore !== null) {
    scores.push({ name: 'strength', label: 'Strength', score: strScore, weight: 0.10 });
  }

  // Sleep — displayed on dashboard but NOT included in vitality age composite.
  // Sleep is a lifestyle behavior that modulates HR, recovery, bloodwork, and strength
  // rather than an independent biomarker. Kept as a driver card for visibility.

  // Aerobic — 5% (VO2 max from fitness test)
  if (metrics.vo2max !== null) {
    var vo2Score = scoreVO2(metrics.vo2max, { sex: metrics.sex, age: metrics.realAge });
    if (vo2Score !== null) {
      scores.push({ name: 'aerobic', label: 'Aerobic', score: vo2Score, weight: 0.05 });
    }
  }

  if (scores.length === 0) return null;

  // Normalise weights for missing dimensions
  var totalW = scores.reduce(function(s, d) { return s + d.weight; }, 0);
  var composite = scores.reduce(function(s, d) { return s + (d.score * d.weight / totalW); }, 0);
  composite = Math.round(composite);

  // Clinical mapping: composite 70 = real age baseline
  // Each 5 points = ~1 year. Range ±15 years max.
  var adjustment = Math.round((composite - 70) / 5);
  var vAge = Math.max(18, Math.min(realAge + 20, realAge - adjustment));

  return {
    vAge: vAge,
    composite: composite,
    scores: scores,
    bloodworkConnected: bwScore !== null
  };
}

function renderVitalityAge(result, realAge) {
  var ageEl = document.getElementById('va-age');
  var deltaEl = document.getElementById('va-delta');
  var realEl = document.getElementById('va-real-age');
  var arcEl = document.getElementById('va-arc-fill');
  var dateEl = document.getElementById('va-date');

  if (realEl) realEl.textContent = realAge;
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });

  if (!result) {
    if (ageEl) ageEl.textContent = '—';
    return;
  }

  // Animate count-up
  if (ageEl) {
    var target = result.vAge;
    var start = realAge;
    var duration = 1000;
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      var ease = 1 - Math.pow(1 - progress, 3);
      ageEl.textContent = Math.round(start + (target - start) * ease);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // Delta label
  if (deltaEl) {
    var diff = realAge - result.vAge;
    if (Math.abs(diff) < 1) {
      deltaEl.textContent = 'on par with your age';
      deltaEl.className = 'vitality-delta same';
    } else if (diff > 0) {
      deltaEl.textContent = diff + ' years younger ↑';
      deltaEl.className = 'vitality-delta younger';
    } else {
      deltaEl.textContent = Math.abs(diff) + ' years to improve';
      deltaEl.className = 'vitality-delta older';
    }
  }

  // Arc fill — composite score drives the arc (0-100 → 0-100% of arc length 283)
  if (arcEl) {
    setTimeout(function() {
      var offset = 283 - (result.composite / 100) * 283;
      arcEl.style.strokeDashoffset = offset;
    }, 100);
  }
}

function renderDriverCards(metrics, result) {
  function setDriver(key, val, score, unit) {
    var cls = score >= 70 ? 'good' : score >= 40 ? 'fair' : score > 0 ? 'low' : 'none';
    var label = score >= 70 ? 'Good' : score >= 40 ? 'Fair' : score > 0 ? 'Needs work' : 'No data';
    var card = document.getElementById('drv-' + key);
    var valEl = document.getElementById('drv-' + key + '-val');
    var barEl = document.getElementById('drv-' + key + '-bar');
    var stEl = document.getElementById('drv-' + key + '-status');
    if (valEl) valEl.textContent = val !== null ? (val + (unit||'')) : '—';
    if (barEl) { barEl.style.width = score + '%'; barEl.className = 'driver-bar-fill ' + (score > 0 ? cls : ''); }
    if (stEl) { stEl.textContent = label; stEl.className = 'driver-status ' + cls; }
    if (card) { card.className = 'driver-card ' + (score >= 70 ? 'good' : score > 0 && score < 40 ? 'low' : ''); }
  }

  var hrScore  = metrics.hr !== null ? scoreHR(metrics.hr) : 0;
  var wtScore  = metrics.weightScore !== null ? metrics.weightScore : 0;
  var strScore = metrics.strengthData !== null ? (scoreStrength(metrics.strengthData) || 0) : 0;
  var aerScore = metrics.vo2max !== null ? (scoreVO2(metrics.vo2max, { sex: metrics.sex, age: metrics.realAge }) || 0) : 0;

  var hrVal  = metrics.hr !== null ? metrics.hr + ' bpm' : null;
  var wtVal  = metrics.weightVal !== null ? metrics.weightVal + ' lbs' : null;
  var strVal = metrics.strengthData !== null
    ? metrics.strengthData.testCount + ' tests · ' + metrics.strengthData.avgPercentile + 'th pctl'
    : null;
  var aerVal = metrics.vo2max !== null
    ? metrics.vo2max + ' ml/kg/min'
    : null;

  setDriver('heart',     hrVal,  hrScore,  '');
  setDriver('weight',    wtVal,  wtScore,  '');
  setDriver('strength',  strVal, strScore, '');
  setDriver('aerobic',   aerVal, aerScore, '');

  // Sleep driver card
  var slpData = metrics.sleepData;
  var slpScore = slpData ? (scoreSleep(slpData) || 0) : 0;
  if (slpData) {
    var debtLabel = slpData.debt <= 1 ? 'Minimal debt' : slpData.debt <= 3 ? 'Mild debt' : slpData.debt <= 7 ? 'Moderate debt' : 'High debt';
    var slpVal = slpData.latest + 'h last night';
    setDriver('sleep', slpVal, slpScore, '');
    var statusText = debtLabel + ' · ' + slpData.debt + 'h';
    if (slpData.efficiency) statusText += ' · ' + slpData.efficiency + '% eff';
    var slpSt = document.getElementById('drv-sleep-status');
    if (slpSt) slpSt.textContent = statusText;
    var slpDetail = document.getElementById('drv-sleep-detail');
    if (slpDetail && slpData.bedtime && slpData.wakeTime) {
      var detailParts = [slpData.bedtime + ' – ' + slpData.wakeTime];
      if (slpData.stages) {
        if (slpData.stages.deep) detailParts.push('Deep ' + slpData.stages.deep.pct + '%');
        if (slpData.stages.rem) detailParts.push('REM ' + slpData.stages.rem.pct + '%');
      }
      slpDetail.textContent = detailParts.join(' · ');
    }
    var slpTrend = document.getElementById('drv-sleep-trend');
    if (slpTrend && slpData.trend) {
      var arrow = slpData.trend.direction === 'improving' ? '↑' : slpData.trend.direction === 'declining' ? '↓' : '→';
      slpTrend.textContent = arrow + ' ' + Math.abs(slpData.trend.deltaHours) + 'h vs last wk';
    }
  } else {
    setDriver('sleep', null, 0, '');
  }

  // Blood work — show connected state if available
  var bwScore = scoreBloodwork(metrics.bloodwork);
  var bwCard = document.getElementById('drv-bloodwork');
  if (bwScore !== null) {
    setDriver('bloodwork', bwScore + '%', bwScore, '');
    if (bwCard) bwCard.style.opacity = '1';
  }
}

function buildInsightSentence(metrics, result) {
  if (!result) return null;
  var diff = (metrics.realAge || 35) - result.vAge;
  var primary = '';

  // Lead with the highest-weighted signal that has data
  if (metrics.hr !== null) {
    var hs = scoreHR(metrics.hr);
    if (hs >= 78)      primary = 'Resting HR of ' + metrics.hr + ' bpm reflects strong cardiovascular fitness.';
    else if (hs >= 50) primary = 'Resting HR of ' + metrics.hr + ' bpm is average — consistent aerobic training will move this needle.';
    else               primary = 'Resting HR of ' + metrics.hr + ' bpm is elevated and is the biggest drag on your score.';
  }

  // Add secondary signal
  var secondary = '';
  if (!result.bloodworkConnected) {
    secondary = ' Uploading blood work will unlock the highest-weighted signal (40%).';
  } else if (!metrics.strengthData) {
    secondary = ' Log fitness tests to unlock your strength score.';
  }

  if (!primary) return null;
  return primary + secondary;
}

// ── Sleep processing functions (session-based) ──
function mapSleepStage(value) {
  if (!value) return null;
  var stage = value.toLowerCase();
  if (stage.includes('deep')) return 'deep';
  if (stage.includes('rem')) return 'rem';
  if (stage.includes('core')) return 'core';
  if (stage.includes('awake')) return 'awake';
  return null;
}

function identifySleepSessions(samples) {
  var sorted = samples.slice().sort(function(a, b) { return new Date(a.start_date) - new Date(b.start_date); });
  var sessions = [];
  var currentSession = [];
  var lastEndMs = null;
  for (var i = 0; i < sorted.length; i++) {
    var sample = sorted[i];
    var startMs = new Date(sample.start_date).getTime();
    var endMs = new Date(sample.end_date).getTime();
    var gapMinutes = lastEndMs != null ? (startMs - lastEndMs) / (1000 * 60) : 0;
    if (lastEndMs == null || gapMinutes > 45) {
      if (currentSession.length > 0) {
        var sessStart = new Date(currentSession[0].start_date).getTime();
        var sessEnd = new Date(currentSession[currentSession.length - 1].end_date).getTime();
        if ((sessEnd - sessStart) / (1000 * 60 * 60) >= 2) {
          sessions.push({ startTime: sessStart, endTime: sessEnd, samples: currentSession.slice() });
        }
      }
      currentSession = [sample];
    } else {
      currentSession.push(sample);
    }
    lastEndMs = endMs;
  }
  if (currentSession.length > 0) {
    var sessStart = new Date(currentSession[0].start_date).getTime();
    var sessEnd = new Date(currentSession[currentSession.length - 1].end_date).getTime();
    if ((sessEnd - sessStart) / (1000 * 60 * 60) >= 2) {
      sessions.push({ startTime: sessStart, endTime: sessEnd, samples: currentSession.slice() });
    }
  }
  return sessions.sort(function(a, b) { return b.startTime - a.startTime; });
}

function computeSessionMinutes(session) {
  var stages = { deep: 0, rem: 0, core: 0, awake: 0 };
  var total = 0;
  for (var i = 0; i < session.samples.length; i++) {
    var s = session.samples[i];
    var stage = mapSleepStage(s.value || s.text_value);
    if (stage === null) continue;
    var duration = (new Date(s.end_date) - new Date(s.start_date)) / (1000 * 60);
    stages[stage] += duration;
    total += duration;
  }
  var actualSleep = Math.max(0, total - stages.awake);
  return { totalMinutes: total, actualSleepMinutes: actualSleep, stages: stages };
}

function calculateSleepTrend(sessions) {
  var now = Date.now();
  var msPerDay = 24 * 60 * 60 * 1000;
  var thisWeek = [];
  var lastWeek = [];
  for (var i = 0; i < sessions.length; i++) {
    var daysAgo = (now - sessions[i].startTime) / msPerDay;
    if (daysAgo <= 7) {
      thisWeek.push(computeSessionMinutes(sessions[i]).actualSleepMinutes / 60);
    } else if (daysAgo <= 14) {
      lastWeek.push(computeSessionMinutes(sessions[i]).actualSleepMinutes / 60);
    }
  }
  if (thisWeek.length === 0 || lastWeek.length === 0) return null;
  var thisWeekAvg = thisWeek.reduce(function(s, h) { return s + h; }, 0) / thisWeek.length;
  var lastWeekAvg = lastWeek.reduce(function(s, h) { return s + h; }, 0) / lastWeek.length;
  var deltaHours = Math.round((thisWeekAvg - lastWeekAvg) * 10) / 10;
  var direction = deltaHours >= 0.25 ? 'improving' : deltaHours <= -0.25 ? 'declining' : 'stable';
  return { thisWeekAvg: Math.round(thisWeekAvg * 10) / 10, lastWeekAvg: Math.round(lastWeekAvg * 10) / 10, deltaHours: deltaHours, direction: direction };
}

async function loadDashboardData() {
  if (!currentUser) return;
  var token = currentSession.access_token;
  var today = localDateStr(new Date());

  // Real age from profile — try birth_date first, then dob
  var realAge = 35;
  var dobStr = (window.userProfileData && (window.userProfileData.birth_date || window.userProfileData.dob)) || null;
  if (dobStr) {
    var dob = new Date(dobStr);
    if (!isNaN(dob)) realAge = Math.floor((new Date() - dob) / (365.25 * 24 * 3600 * 1000));
  }
  console.log('[Healix] Dashboard loading — realAge:', realAge, 'profile:', window.userProfileData ? Object.keys(window.userProfileData) : 'null');

  var sex = (window.userProfileData && window.userProfileData.sex) || 'male';
  var metrics = { hr: null, vo2max: null, sex: sex, weightScore: null, weightVal: null, strengthData: null, bloodwork: null, sleep: null, sleepData: null, steps: null, nutritionScore: null, realAge: realAge };
  var timestamps = {};

  // 1. Health data (last 14 days for context)
  try {
    var daysAgo = new Date(); daysAgo.setDate(daysAgo.getDate() - 21);
    var healthData = await supabaseRequest(
      '/rest/v1/apple_health_samples?select=metric_type,start_date,end_date,value,text_value,recorded_at&user_id=eq.' + currentUser.id + '&recorded_at=gte.' + daysAgo.toISOString() + '&order=recorded_at.desc',
      'GET', null, token
    );
    console.log('[Healix] healthData rows:', healthData ? (healthData.error ? 'ERROR:'+JSON.stringify(healthData.error) : healthData.length) : 'null');
    if (healthData && !healthData.error) {
      var byType = {};
      healthData.forEach(function(r) {
        if (!byType[r.metric_type]) byType[r.metric_type] = [];
        byType[r.metric_type].push(r);
      });
      console.log('[Healix] health metric types:', Object.keys(byType));

      // Sleep — session-based processing per CTO spec
      var sleepRows = byType['sleep_analysis'] || [];
      if (sleepRows.length > 0) {
        var sessions = identifySleepSessions(sleepRows);
        if (sessions.length > 0) {
          var mostRecent = computeSessionMinutes(sessions[0]);
          var latestSleep = Math.round((mostRecent.actualSleepMinutes / 60) * 10) / 10;
          // Compute per-session actual sleep hours for averages and debt
          var sessionSleepHours = sessions.map(function(sess) {
            return computeSessionMinutes(sess).actualSleepMinutes / 60;
          });
          var avgSleep = Math.round(sessionSleepHours.reduce(function(s, h) { return s + h; }, 0) / sessionSleepHours.length * 10) / 10;
          var TARGET_SLEEP = 7;
          var recentSessions = sessionSleepHours.slice(0, 7);
          var sleepDebt = recentSessions.reduce(function(debt, h) {
            var deficit = TARGET_SLEEP - h;
            return debt + (deficit > 0 ? deficit : 0);
          }, 0);
          sleepDebt = Math.round(sleepDebt * 10) / 10;
          var totalHours = Math.round((mostRecent.actualSleepMinutes / 60) * 10) / 10;
          var totalMinutes = Math.round(mostRecent.actualSleepMinutes);
          var stageBreakdown = {};
          var stageKeys = ['deep', 'rem', 'core', 'awake'];
          for (var si = 0; si < stageKeys.length; si++) {
            var sk = stageKeys[si];
            var mins = Math.round(mostRecent.stages[sk]);
            stageBreakdown[sk] = { minutes: mins, pct: mostRecent.totalMinutes > 0 ? Math.round((mostRecent.stages[sk] / mostRecent.totalMinutes) * 100) : 0 };
          }
          var efficiency = mostRecent.totalMinutes > 0 ? Math.round((mostRecent.actualSleepMinutes / mostRecent.totalMinutes) * 100) : 0;
          var bedtime = new Date(sessions[0].startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          var wakeTime = new Date(sessions[0].endTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          var trend = calculateSleepTrend(sessions);
          metrics.sleep = latestSleep;
          metrics.sleepData = { latest: latestSleep, avg: avgSleep, nights: sessions.length, debt: sleepDebt, totalHours: totalHours, totalMinutes: totalMinutes, stages: stageBreakdown, efficiency: efficiency, bedtime: bedtime, wakeTime: wakeTime, trend: trend };
        }
      }

      // Steps
      var stepsRows = byType['step_count'] || [];
      var todaySteps = stepsRows.filter(function(r) { return r.start_date && r.start_date.startsWith(today); })
        .reduce(function(s, r) { return s + parseFloat(r.value||0); }, 0);
      if (todaySteps === 0 && stepsRows.length > 0) todaySteps = parseFloat(stepsRows[0].value || 0);
      if (todaySteps > 0) metrics.steps = Math.round(todaySteps);

      // HR
      var hrRows = (byType['resting_heart_rate'] || []).concat(byType['heart_rate'] || []);
      if (hrRows.length > 0) {
        metrics.hr = Math.round(parseFloat(hrRows[0].value));
        timestamps.heart_rate = hrRows[0].recorded_at;
      }

      // Timestamps for sleep and steps
      if (sleepRows.length > 0 && sessions && sessions.length > 0) {
        timestamps.sleep = new Date(sessions[0].endTime).toISOString();
      }
      if (stepsRows.length > 0) {
        timestamps.steps = stepsRows[0].start_date || stepsRows[0].recorded_at;
      }

    }
  } catch(e) { console.error('Health error:', e); }

  // 2. Meals / nutrition score
  try {
    var mealLogs = await supabaseRequest(
      '/rest/v1/meal_log?select=id,meal_type,meal_time,meal_description,created_at,data&user_id=eq.' + currentUser.id + '&order=created_at.desc&limit=100',
      'GET', null, token
    );
    console.log('[Healix] mealLogs:', mealLogs ? (mealLogs.error ? 'ERROR' : mealLogs.length) : 'null');
    if (mealLogs && !mealLogs.error && mealLogs.length > 0) {
      var todayMeals = mealLogs.filter(function(m) {
        return localDateStr(new Date(m.meal_time || m.created_at)) === today;
      });
      console.log('[Healix] todayMeals:', todayMeals.length, 'today=', today);
      if (todayMeals.length > 0) {
        var totals = { cal: 0, prot: 0, carb: 0, fat: 0 };
        todayMeals.forEach(function(m) {
          var mac = getMacrosFromMeal(m);
          totals.cal  += mac.cal  || 0;
          totals.prot += mac.prot || 0;
          totals.carb += mac.carb || 0;
          totals.fat  += mac.fat  || 0;
        });
        // Score: calories within goal = 40pts, protein >= 80% goal = 30pts, logged at least 2 meals = 30pts
        var calScore  = totals.cal  > 0 ? Math.min(40, Math.round(40 * Math.min(1, 1 - Math.abs(totals.cal - 2000) / 2000))) : 0;
        var protScore = totals.prot > 0 ? Math.min(30, Math.round(30 * Math.min(1, totals.prot / 150))) : 0;
        var mealScore = Math.min(30, todayMeals.length * 15);
        metrics.nutritionScore = calScore + protScore + mealScore;
        // Also update macro display elements used by dashboard
        renderMacrosFromMealData(todayMeals);
      } else {
        metrics.nutritionScore = 0;
      }
    }
  } catch(e) { console.error('Meal error:', e); }

  // 3. Strength — fitness test percentile average
  try {
    var strengthTests = await supabaseRequest(
      '/rest/v1/fitness_tests?user_id=eq.' + currentUser.id + '&test_key=in.(bench_1rm,squat_1rm,deadlift_1rm,pushup,pullup)&order=tested_at.desc&limit=20',
      'GET', null, token
    );
    if (strengthTests && !strengthTests.error && strengthTests.length > 0) {
      var percentiles = strengthTests.filter(function(t) { return t.percentile != null; }).map(function(t) { return parseFloat(t.percentile); });
      var avgPctl = percentiles.length > 0 ? Math.round(percentiles.reduce(function(s, p) { return s + p; }, 0) / percentiles.length) : 50;
      metrics.strengthData = { testCount: strengthTests.length, avgPercentile: avgPctl, tests: strengthTests };
      timestamps.strength = strengthTests[0].tested_at;
    } else {
      metrics.strengthData = null;
    }
  } catch(e) { metrics.strengthData = null; }

  // 4. Weight — BMI-based scoring from user profile
  try {
    var weightKg = window.userProfileData && window.userProfileData.current_weight_kg;
    var heightCm = window.userProfileData && window.userProfileData.height_cm;
    if (weightKg) {
      metrics.weightVal = Math.round(weightKg * 2.205);
      metrics.weightScore = scoreWeight(weightKg, heightCm);
    }
    // Get weight timestamp from latest weight log
    var weightLogs = await supabaseRequest(
      '/rest/v1/weight_logs?user_id=eq.' + currentUser.id + '&order=logged_at.desc&limit=1',
      'GET', null, token
    );
    if (weightLogs && !weightLogs.error && weightLogs.length > 0) {
      timestamps.weight = weightLogs[0].logged_at;
    }
  } catch(e) { /* weight/height not available */ }

  // 5. VO2 Max — latest fitness test result
  try {
    var vo2Tests = await supabaseRequest(
      '/rest/v1/fitness_tests?user_id=eq.' + currentUser.id + '&test_key=eq.vo2max&order=tested_at.desc&limit=1',
      'GET', null, token
    );
    if (vo2Tests && !vo2Tests.error && vo2Tests.length > 0) {
      metrics.vo2max = parseFloat(vo2Tests[0].raw_value);
      timestamps.vo2max = vo2Tests[0].tested_at;
    }
  } catch(e) { console.error('VO2 fetch error:', e); }

  // 6. Bloodwork — fetch from blood_work_samples table
  try {
    var bwData = await supabaseRequest(
      '/rest/v1/blood_work_samples?user_id=eq.' + currentUser.id + '&order=test_date.desc,created_at.desc&limit=100',
      'GET', null, token
    );
    console.log('[Healix] blood_work_samples:', bwData ? (bwData.error ? 'ERROR:'+JSON.stringify(bwData.error) : bwData.length + ' rows') : 'null');
    if (bwData && !bwData.error && bwData.length > 0) {
      var BIOMARKER_MAP = {
        'Glucose': 'glucose', 'Fasting Glucose': 'glucose', 'Glucose, Fasting': 'glucose',
        'Glucose, Serum': 'glucose',
        'Hemoglobin A1c': 'hba1c', 'HbA1c': 'hba1c', 'A1C': 'hba1c', 'Hemoglobin A1C': 'hba1c',
        'LDL Chol Calc (NIH)': 'ldl', 'LDL Cholesterol': 'ldl', 'LDL-C': 'ldl',
        'LDL Cholesterol Calc': 'ldl',
        'HDL Cholesterol': 'hdl', 'HDL-C': 'hdl', 'HDL': 'hdl',
        'hs-CRP': 'crp', 'CRP': 'crp', 'C-Reactive Protein': 'crp',
        'hsCRP': 'crp', 'C-Reactive Protein, Cardiac': 'crp',
        'Triglycerides': 'triglycerides', 'Triglyceride': 'triglycerides', 'TG': 'triglycerides',
        'Creatinine': 'creatinine', 'Creatinine, Serum': 'creatinine'
      };
      // Use only the most recent test date
      var latestDate = bwData[0].test_date;
      var latestSamples = bwData.filter(function(s) { return s.test_date === latestDate; });
      var bw = {};
      latestSamples.forEach(function(sample) {
        var key = BIOMARKER_MAP[sample.biomarker_name];
        if (!key) {
          var lowerName = sample.biomarker_name.toLowerCase();
          var mapKeys = Object.keys(BIOMARKER_MAP);
          for (var i = 0; i < mapKeys.length; i++) {
            if (mapKeys[i].toLowerCase() === lowerName) { key = BIOMARKER_MAP[mapKeys[i]]; break; }
          }
        }
        if (key && sample.value !== null) bw[key] = parseFloat(sample.value);
      });
      metrics.bloodwork = Object.keys(bw).length > 0 ? bw : null;
      if (metrics.bloodwork) timestamps.bloodwork = bwData[0].test_date;
      console.log('[Healix] bloodwork mapped:', JSON.stringify(bw));
    }
  } catch(e) { console.error('Bloodwork fetch error:', e); metrics.bloodwork = null; }

  // Render everything
  console.log('[Healix] metrics:', JSON.stringify(metrics));
  var result = calcVitalityAge(metrics);
  console.log('[Healix] vitalityResult:', result);
  renderVitalityAge(result, realAge);
  renderDriverCards(metrics, result);

  // AI insight sentence
  var sentence = buildInsightSentence(metrics, result);
  var bar = document.getElementById('va-insight-bar');
  var txt = document.getElementById('va-insight-text');
  if (sentence && bar && txt) {
    txt.textContent = sentence;
    bar.style.display = 'flex';
  }

  // Freshness indicators
  renderFreshnessIndicator('drv-heart-freshness', 'heart_rate', timestamps.heart_rate);
  renderFreshnessIndicator('drv-sleep-freshness', 'sleep', timestamps.sleep);
  renderFreshnessIndicator('drv-weight-freshness', 'weight', timestamps.weight);
  renderFreshnessIndicator('drv-strength-freshness', 'strength', timestamps.strength);
  renderFreshnessIndicator('drv-aerobic-freshness', 'vo2max', timestamps.vo2max);
  renderFreshnessIndicator('drv-bloodwork-freshness', 'bloodwork', timestamps.bloodwork);
  renderSyncBanner(timestamps);
  renderVitalityConfidence(timestamps);

  // Cache dashboard data in localStorage for instant render on next visit
  try {
    localStorage.setItem('healix_dashboard_cache', JSON.stringify({
      metrics: metrics, timestamps: timestamps, result: result, realAge: realAge, cachedAt: Date.now()
    }));
  } catch(e) { /* localStorage full or unavailable */ }
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
function setEl(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; }
function setHTML(id, val) { var e = document.getElementById(id); if (e) e.innerHTML = val; }
function setClass(id, cls) { var e = document.getElementById(id); if (e) e.className = cls; }

function renderHealthStats(byType, today) {
  // Sleep is now handled by the driver card in renderDriverCards — no separate stat display needed

  // Steps - unit: steps, sum all entries for today
  var stepsKeys = ['step_count'];
  var stepsData = [];
  stepsKeys.forEach(function(k) { if (byType[k]) stepsData = stepsData.concat(byType[k]); });
  if (stepsData.length > 0) {
    var todaySteps = stepsData.filter(function(r) { return r.start_date && r.start_date.startsWith(today); })
      .reduce(function(s, r) { return s + parseFloat(r.value || 0); }, 0);
    if (todaySteps === 0) todaySteps = stepsData
      .filter(function(r) { return r.start_date; })
      .slice(0, 3)
      .reduce(function(s, r) { return s + parseFloat(r.value || 0); }, 0);
    setHTML('d-steps', todaySteps >= 1000
      ? (Math.round(todaySteps / 100) / 10) + '<span class="stat-item-unit">k</span>'
      : Math.round(todaySteps).toString());
    var stepsAvg = stepsData.reduce(function(s, r) { return s + parseFloat(r.value || 0); }, 0) / Math.max(stepsData.length, 1);
    var sd = Math.round(((todaySteps - stepsAvg) / Math.max(stepsAvg, 1)) * 100);
    setEl('d-steps-d', sd > 5 ? '↑ +' + sd + '% vs avg' : sd < -5 ? '↓ ' + sd + '% vs avg' : '— avg pace');
    setClass('d-steps-d', 'stat-item-delta ' + (sd > 5 ? 'delta-up' : sd < -5 ? 'delta-down' : 'delta-neutral'));
    updateMiniChart('d-chart', stepsData, today);
  }

  // HR
  var hrKeys = ['resting_heart_rate', 'walking_heart_rate_average', 'heart_rate'];
  var hrData = [];
  hrKeys.forEach(function(k) { if (byType[k]) hrData = hrData.concat(byType[k]); });
  if (hrData.length > 0) {
    var hr = Math.round(parseFloat(hrData[0].value));
    var hrAvg = Math.round(hrData.reduce(function(s, r) { return s + parseFloat(r.value || 0); }, 0) / hrData.length);
    setHTML('d-hr', hr + '<span class="stat-item-unit">bpm</span>');
    var hd = hr - hrAvg;
    setEl('d-hr-d', Math.abs(hd) <= 2 ? '— avg ' + hrAvg : hd > 0 ? '↑ +' + hd + ' vs avg' : '↓ ' + hd + ' vs avg');
    setClass('d-hr-d', 'stat-item-delta ' + (Math.abs(hd) <= 2 ? 'delta-neutral' : hd > 0 ? 'delta-down' : 'delta-up'));
  }

  // Active calories - unit: kcal, sum today entries
  var calKeys = ['active_energy_burned'];
  var calData = [];
  calKeys.forEach(function(k) { if (byType[k]) calData = calData.concat(byType[k]); });
  if (calData.length > 0) {
    var tc = calData.filter(function(r) { return r.start_date && r.start_date.startsWith(today); })
      .reduce(function(s, r) { return s + parseFloat(r.value || 0); }, 0);
    if (tc === 0) tc = calData
      .filter(function(r) { return r.start_date; })
      .slice(0, 3)
      .reduce(function(s, r) { return s + parseFloat(r.value || 0); }, 0);
    tc = Math.round(tc);
    setHTML('d-cal', tc + '<span class="stat-item-unit">kcal</span>');
    var ca = Math.round(calData.reduce(function(s, r) { return s + parseFloat(r.value || 0); }, 0) / Math.max(calData.length, 1));
    var cd = Math.round(((tc - ca) / Math.max(ca, 1)) * 100);
    setEl('d-cal-d', Math.abs(cd) < 5 ? '— avg ' + ca : cd > 0 ? '↑ +' + cd + '% vs avg' : '↓ ' + cd + '% vs avg');
    setClass('d-cal-d', 'stat-item-delta ' + (Math.abs(cd) < 5 ? 'delta-neutral' : cd > 0 ? 'delta-up' : 'delta-down'));
  }
}

function updateMiniChart(id, data, today) {
  var dayMap = {};
  data.forEach(function(r) {
    var day = r.start_date ? r.start_date.split('T')[0] : null;
    if (!day) return;
    dayMap[day] = (dayMap[day] || 0) + parseFloat(r.value || 0);
  });
  var days = Object.keys(dayMap).sort().slice(-7);
  var vals = days.map(function(d) { return dayMap[d]; });
  var maxV = Math.max.apply(null, vals) || 1;
  var bars = document.querySelectorAll('#' + id + ' .mini-bar');
  bars.forEach(function(bar, i) {
    bar.style.height = Math.max(8, Math.round((vals[i] || 0) / maxV * 100)) + '%';
    bar.classList.toggle('today', days[i] === today);
  });
}

function renderDashMeals(meals, today) {
  var el = document.getElementById('d-meals');
  if (!el) return;
  var todayMeals = meals;
  var el = document.getElementById('d-meals');
  var emojis = { breakfast:'🍳', lunch:'🥗', dinner:'🍽', snack:'🍎' };
  if (todayMeals.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🍽</div><div class="empty-state-text">No meals logged today</div></div>';
    return;
  }
  el.innerHTML = todayMeals.slice(0, 4).map(function(m) {
    var t = new Date(m.meal_time || m.created_at);
    var mealType = (m.meal_type || '').toLowerCase();
    return '<div class="meal-row">'
      + '<div class="meal-emoji">' + (emojis[mealType] || '🥘') + '</div>'
      + '<div class="meal-info"><div class="meal-name">' + (m.meal_description || 'Meal') + '</div>'
      + '<div class="meal-meta">' + (m.meal_type || '') + ' · ' + t.toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'}) + '</div></div>'
      + '<div class="meal-cals">—</div>'
      + '</div>';
  }).join('');
}

function renderMacrosFromMealData(meals) {
  var cal = 0, prot = 0, carbs = 0, fat = 0;
  meals.forEach(function(m) {
    var macros = getMacrosFromMeal(m);
    cal   += macros.cal  || 0;
    prot  += macros.prot || 0;
    carbs += macros.carb || 0;
    fat   += macros.fat  || 0;
  });
  renderDayMacroUI(Math.round(cal), Math.round(prot), Math.round(carbs), Math.round(fat));
}

function renderMacrosFromNutrients(nutrients) {
  var macroByMeal = {};
  nutrients.forEach(function(n) {
    if (!macroByMeal[n.meal_log_id]) macroByMeal[n.meal_log_id] = {};
    var key = n.name, val = parseFloat(n.value || 0);
    if (n.category === 'Macronutrients' || !macroByMeal[n.meal_log_id][key]) {
      macroByMeal[n.meal_log_id][key] = val;
    }
  });
  var totals = {};
  Object.values(macroByMeal).forEach(function(m) {
    Object.keys(m).forEach(function(k) { totals[k] = (totals[k] || 0) + m[k]; });
  });
  renderDayMacroUI(
    Math.round(totals['Calories'] || totals['Energy'] || 0),
    Math.round(totals['Protein'] || totals['Proteins'] || 0),
    Math.round(totals['Carbohydrates'] || totals['Total Carbohydrates'] || 0),
    Math.round(totals['Total Fat'] || totals['Fat'] || totals['Fats'] || 0)
  );
}

function renderDayMacroUI(cal, prot, carbs, fat) {
  var macroTotal = prot + carbs + fat || 1;
  var calGoal = 2000;
  var setEl = function(id,v) { var e=document.getElementById(id); if(e) e.textContent=v; };
  var setHTML = function(id,v) { var e=document.getElementById(id); if(e) e.innerHTML=v; };
  var setW = function(id,v) { var e=document.getElementById(id); if(e) e.style.width=v; };

  // Top summary cards
  setEl('mp-cal', cal || '—');
  setEl('mp-cal-sub', 'of 2000 goal');
  setHTML('mp-protein', (prot||'—') + '<span style="font-size:16px;color:var(--muted)">g</span>');
  setEl('mp-prot-sub', 'of 150g goal');
  setHTML('mp-carbs', (carbs||'—') + '<span style="font-size:16px;color:var(--muted)">g</span>');
  setEl('mp-carb-sub', 'today');
  setHTML('mp-fat', (fat||'—') + '<span style="font-size:16px;color:var(--muted)">g</span>');
  setEl('mp-fat-sub', 'today');

  // (macro proportion bars removed — summary cards above are sufficient)
}


// Canonical nutrient definitions — field names match actual API output from meal_log.data.total_nutrition
// Categories in API: Macronutrients, Fats, Minerals, Vitamins, AminoAcids, SugarsAndFibers, OtherCompounds
var MICRO_DEFS = {
  vitamins: [
    // Vitamin A comes as IU from API; convert to mcg RAE (1 mcg RAE = 3.33 IU retinol)
    { key: 'Vitamin A',   aliases: ['Vitamin A'],           rda: 900,  unit: 'mcg', display: 'Vitamin A',  iuToMcg: 3.33 },
    { key: 'Vitamin C',   aliases: ['Vitamin C'],           rda: 90,   unit: 'mg',  display: 'Vitamin C'      },
    { key: 'Vitamin D',   aliases: ['Vitamin D'],           rda: 20,   unit: 'mcg', display: 'Vitamin D'      },
    { key: 'Vitamin E',   aliases: ['Vitamin E'],           rda: 15,   unit: 'mg',  display: 'Vitamin E'      },
    { key: 'Vitamin K',   aliases: ['Vitamin K'],           rda: 120,  unit: 'mcg', display: 'Vitamin K'      },
    { key: 'Thiamin',     aliases: ['Thiamin','Thiamine'],  rda: 1.2,  unit: 'mg',  display: 'B1 Thiamin'     },
    { key: 'Riboflavin',  aliases: ['Riboflavin'],          rda: 1.3,  unit: 'mg',  display: 'B2 Riboflavin'  },
    { key: 'Niacin',      aliases: ['Niacin'],              rda: 16,   unit: 'mg',  display: 'B3 Niacin'      },
    { key: 'Vitamin B6',  aliases: ['Vitamin B6'],          rda: 1.7,  unit: 'mg',  display: 'B6'             },
    { key: 'Folate',      aliases: ['Folate','Folic Acid'], rda: 400,  unit: 'mcg', display: 'B9 Folate'      },
    { key: 'Vitamin B12', aliases: ['Vitamin B12'],         rda: 2.4,  unit: 'mcg', display: 'B12'            },
    { key: 'Biotin',      aliases: ['Biotin'],              rda: 30,   unit: 'mcg', display: 'Biotin'         },
    { key: 'Choline',     aliases: ['Choline'],             rda: 550,  unit: 'mg',  display: 'Choline'        },
  ],
  minerals: [
    { key: 'Calcium',     aliases: ['Calcium'],             rda: 1000, unit: 'mg',  display: 'Calcium'        },
    { key: 'Iron',        aliases: ['Iron'],                rda: 18,   unit: 'mg',  display: 'Iron'           },
    { key: 'Magnesium',   aliases: ['Magnesium'],           rda: 400,  unit: 'mg',  display: 'Magnesium'      },
    { key: 'Phosphorus',  aliases: ['Phosphorus'],          rda: 700,  unit: 'mg',  display: 'Phosphorus'     },
    { key: 'Potassium',   aliases: ['Potassium'],           rda: 4700, unit: 'mg',  display: 'Potassium'      },
    { key: 'Sodium',      aliases: ['Sodium'],              rda: 2300, unit: 'mg',  display: 'Sodium'         },
    { key: 'Zinc',        aliases: ['Zinc'],                rda: 11,   unit: 'mg',  display: 'Zinc'           },
    { key: 'Selenium',    aliases: ['Selenium'],            rda: 55,   unit: 'mcg', display: 'Selenium'       },
    { key: 'Copper',      aliases: ['Copper'],              rda: 0.9,  unit: 'mg',  display: 'Copper'         },
    { key: 'Manganese',   aliases: ['Manganese'],           rda: 2.3,  unit: 'mg',  display: 'Manganese'      },
    { key: 'Iodine',      aliases: ['Iodine'],              rda: 150,  unit: 'mcg', display: 'Iodine'         },
  ],
  other: [
    // SugarsAndFibers category
    { key: 'Fiber',          aliases: ['Fiber','Dietary Fiber','Total Fiber'],    rda: 28,  unit: 'g',  display: 'Fiber'          },
    // Fats category
    { key: 'Saturated Fat',  aliases: ['Saturated Fat','Saturated Fats'],         rda: 20,  unit: 'g',  display: 'Saturated Fat'  },
    // AminoAcids category
    { key: 'Leucine',        aliases: ['Leucine'],                                rda: 2.7, unit: 'g',  display: 'Leucine'        },
    { key: 'Lysine',         aliases: ['Lysine'],                                 rda: 2.1, unit: 'g',  display: 'Lysine'         },
    // OtherCompounds category
    { key: 'Cholesterol',    aliases: ['Cholesterol'],                            rda: 300, unit: 'mg', display: 'Cholesterol'    },
    { key: 'Omega-3',        aliases: ['Omega-3','Omega 3','ALA'],                rda: 1.6, unit: 'g',  display: 'Omega-3'        },
  ]
};

// Build alias -> def map for fast lookup
var MICRO_ALIAS_MAP = (function() {
  var map = {};
  Object.values(MICRO_DEFS).forEach(function(group) {
    group.forEach(function(def) {
      def.aliases.forEach(function(a) { map[a] = def; });
    });
  });
  return map;
})();

function getMicroTotalsFromMeals(meals) {
  var totals = {};
  meals.forEach(function(m) {
    var data = null;
    try { data = typeof m.data === 'string' ? JSON.parse(m.data) : m.data; } catch(e) {}
    if (!data || !data.total_nutrition) return;
    var seenThisMeal = {};
    Object.values(data.total_nutrition).forEach(function(cat) {
      if (!Array.isArray(cat)) return;
      cat.forEach(function(item) {
        var def = MICRO_ALIAS_MAP[item.name];
        if (!def) return;
        var val = parseFloat(item.value || 0);
        if (!val) return;
        // Convert Vitamin A from IU to mcg RAE if needed
        if (def.iuToMcg && item.unit && item.unit.toLowerCase().indexOf('iu') !== -1) {
          val = val / def.iuToMcg;
        }
        if (!seenThisMeal[def.key] || val > seenThisMeal[def.key]) {
          seenThisMeal[def.key] = val;
        }
      });
    });
    Object.keys(seenThisMeal).forEach(function(key) {
      totals[key] = (totals[key] || 0) + seenThisMeal[key];
    });
  });
  return totals;
}

function renderMicroPanel(totals, containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  function microItem(def) {
    var val = totals[def.key] || 0;
    var pct = Math.min(120, Math.round((val / def.rda) * 100)); // cap bar at 120% but show real %
    var barPct = Math.min(100, pct);
    var cls = pct === 0 ? 'low' : pct < 33 ? 'low' : pct >= 80 ? 'good' : '';
    var pctCls = pct === 0 ? 'low' : pct < 33 ? 'low' : pct >= 80 ? 'good' : 'mid';
    var valStr = val > 0
      ? (val >= 100 ? Math.round(val) : val >= 10 ? Math.round(val*10)/10 : Math.round(val*100)/100) + def.unit
      : '—';
    return '<div class="micro-item">'
      + '<div class="micro-label">'
      + '<span class="micro-name">' + def.display + '</span>'
      + '<span class="micro-pct ' + pctCls + '">' + (val > 0 ? pct + '%' : '—') + '</span>'
      + '</div>'
      + '<div class="micro-track"><div class="micro-fill ' + cls + '" style="width:' + barPct + '%"></div></div>'
      + '<div class="micro-val">' + valStr + ' / ' + def.rda + def.unit + ' RDA</div>'
      + '</div>';
  }

  function section(label, group) {
    var defs = MICRO_DEFS[group].filter(function(d) { return totals[d.key] !== undefined || true; });
    return '<div class="micro-section-title">' + label + '</div>'
      + '<div class="micro-grid">' + defs.map(microItem).join('') + '</div>';
  }

  container.innerHTML = section('Vitamins', 'vitamins')
    + section('Minerals', 'minerals')
    + section('Fiber & Other', 'other');
}

function renderMicronutrientsFromMealData(meals) {
  var panel = document.getElementById('meals-micro-panel');
  if (!panel) return;
  var totals = getMicroTotalsFromMeals(meals);
  var hasAny = Object.keys(totals).length > 0;
  panel.style.display = hasAny ? 'block' : 'none';
  if (hasAny) renderMicroPanel(totals, 'meals-micro-content');
}

function renderMicronutrientsFromNutrients(nutrients) {
  // Legacy path: reads from meal_nutrient table rows (may be empty)
  // Converts to same totals format and delegates to renderMicroPanel
  if (!nutrients || nutrients.length === 0) return;
  var totals = {};
  var seenPerMeal = {};
  nutrients.forEach(function(n) {
    var def = MICRO_ALIAS_MAP[n.name];
    if (!def) return;
    var val = parseFloat(n.value || 0);
    if (!val) return;
    if (!seenPerMeal[n.meal_log_id]) seenPerMeal[n.meal_log_id] = {};
    if (!seenPerMeal[n.meal_log_id][def.key] || val > seenPerMeal[n.meal_log_id][def.key]) {
      seenPerMeal[n.meal_log_id][def.key] = val;
    }
  });
  Object.values(seenPerMeal).forEach(function(meal) {
    Object.keys(meal).forEach(function(k) { totals[k] = (totals[k] || 0) + meal[k]; });
  });
  // Also update the dashboard micro-grid if it exists
  var grid = document.getElementById('micro-grid');
  if (grid) renderMicroPanel(totals, 'micro-grid');
}

function renderInsights(insights) {
  var el = document.getElementById('d-insights');
  if (!el) return;
  el.innerHTML = insights.map(function(ins) {
    var riskClass = 'risk-' + (ins.risk_level || 'low');
    return '<div class="insight-item">'
      + '<div class="insight-top">'
      + '<span class="insight-risk ' + riskClass + '">' + (ins.risk_level || 'low') + '</span>'
      + '<span class="insight-title">' + ins.title + '</span>'
      + '</div>'
      + '<div class="insight-body">' + (ins.summary || '').substring(0, 120) + (ins.summary && ins.summary.length > 120 ? '...' : '') + '</div>'
      + '</div>';
  }).join('');
}

// ── WEIGHT ──
var weightEntries = [];

async function loadWeightHistory() {
  if (!currentUser) return;
  try {
    var data = await supabaseRequest(
      '/rest/v1/weight_logs?user_id=eq.' + currentUser.id + '&order=logged_at.desc&limit=14',
      'GET', null, currentSession.access_token
    );
    if (data && !data.error && data.length > 0) {
      weightEntries = data;
      var latest = data[0];
      setHTML('d-weight', parseFloat(latest.value).toFixed(1) + '<span class="weight-unit">' + (latest.unit || 'lbs') + '</span>');
      if (data.length > 1) {
        var prev = parseFloat(data[1].value), cur = parseFloat(latest.value);
        var diff = Math.round((cur - prev) * 10) / 10;
        var el = document.getElementById('d-weight-d');
        el.textContent = diff > 0 ? '↑ +' + diff + ' since last entry' : diff < 0 ? '↓ ' + diff + ' since last entry' : '— unchanged';
        el.className = 'weight-delta ' + (diff > 0 ? 'delta-up' : diff < 0 ? 'delta-down' : 'delta-neutral');
      }
      renderWeightHistory(data);
    }
  } catch(e) { console.error('Weight load error:', e); }
}

function renderWeightHistory(entries) {
  var list = document.getElementById('weight-history-list');
  if (!list) return;
  list.innerHTML = entries.slice(0, 8).map(function(e, i) {
    var diff = i < entries.length - 1 ? parseFloat(e.value) - parseFloat(entries[i+1].value) : 0;
    diff = Math.round(diff * 10) / 10;
    var dt = new Date(e.logged_at || e.created_at);
    return '<div class="weight-entry">'
      + '<div class="weight-entry-date">' + dt.toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) + '</div>'
      + '<div class="weight-entry-val">' + parseFloat(e.value).toFixed(1) + ' <span style="font-size:12px;color:var(--muted)">' + (e.unit || 'lbs') + '</span></div>'
      + (diff !== 0 ? '<div class="weight-entry-delta ' + (diff > 0 ? 'delta-up' : 'delta-down') + '">' + (diff > 0 ? '+' : '') + diff + '</div>' : '<div class="weight-entry-delta delta-neutral">—</div>')
      + '</div>';
  }).join('');
}

function setWeightDateDefault() {
  var d = document.getElementById('w-date');
  if (d) d.value = new Date().toISOString().split('T')[0];
}

async function saveWeight() {
  var val = document.getElementById('w-value').value;
  var unit = document.getElementById('w-unit').value;
  var date = document.getElementById('w-date').value;
  var notes = document.getElementById('w-notes').value;
  if (!val) { alert('Please enter a weight value.'); return; }
  try {
    await supabaseRequest('/rest/v1/weight_logs', 'POST', {
      user_id: currentUser.id, value: parseFloat(val), unit: unit,
      logged_at: date + 'T12:00:00Z', notes: notes
    }, currentSession.access_token);
    closeModal('weight-modal');
    document.getElementById('w-value').value = '';
    document.getElementById('w-notes').value = '';
    loadWeightHistory();
  } catch(e) { alert('Could not save weight. Please try again.'); }
}

// ── MEALS ──
var mealsView = 'day';
var mealsDate = new Date();

function setMealsView(view, btn) {
  mealsView = view;
  document.querySelectorAll('#page-meals .tf-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  document.getElementById('meals-day-view').style.display = view === 'day' ? 'block' : 'none';
  document.getElementById('meals-aggregate-view').style.display = view !== 'day' ? 'block' : 'none';
  updateMealsDateLabel();
  loadMealsPage();
}

function stepMealsDate(dir) {
  if (mealsView === 'day') mealsDate.setDate(mealsDate.getDate() + dir);
  else if (mealsView === 'week') mealsDate.setDate(mealsDate.getDate() + dir * 7);
  else if (mealsView === 'month') mealsDate.setMonth(mealsDate.getMonth() + dir);
  var now = new Date();
  if (mealsDate > now) mealsDate = new Date(now);
  updateMealsDateLabel();
  loadMealsPage();
}

function resetMealsDate() {
  mealsDate = new Date();
  updateMealsDateLabel();
  loadMealsPage();
}

function getMealsDateRange() {
  var end = new Date(mealsDate);
  end.setHours(23,59,59,999);
  var start = new Date(mealsDate);
  if (mealsView === 'day') {
    start.setHours(0,0,0,0);
  } else if (mealsView === 'week') {
    start.setDate(start.getDate() - 6);
    start.setHours(0,0,0,0);
  } else {
    start.setDate(1);
    start.setHours(0,0,0,0);
  }
  return { start: start, end: end };
}

function localDateStr(date) {
  return date.getFullYear() + '-'
    + String(date.getMonth()+1).padStart(2,'0') + '-'
    + String(date.getDate()).padStart(2,'0');
}

function updateMealsDateLabel() {
  var label = document.getElementById('meals-date-label');
  var todayBtn = document.getElementById('meals-today-btn');
  var nextBtn = document.getElementById('meals-next-btn');
  var today = new Date();
  var isToday = localDateStr(mealsDate) === localDateStr(today);

  if (mealsView === 'day') {
    if (isToday) label.innerHTML = '<em>Today</em>';
    else if (localDateStr(mealsDate) === localDateStr(new Date(today.getTime() - 86400000))) label.innerHTML = 'Yesterday';
    else label.innerHTML = mealsDate.toLocaleDateString('en-US', {weekday:'short', month:'long', day:'numeric'});
  } else if (mealsView === 'week') {
    var range = getMealsDateRange();
    label.innerHTML = range.start.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' – ' + range.end.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  } else {
    label.innerHTML = mealsDate.toLocaleDateString('en-US', {month:'long', year:'numeric'});
  }

  if (nextBtn) nextBtn.disabled = isToday;
  if (todayBtn) todayBtn.classList.toggle('active', isToday);
  var aggLabel = document.getElementById('agg-period-label');
  if (aggLabel) aggLabel.textContent = mealsView === 'week' ? 'This week' : 'This month';
}

var _mealsLoadTimer = null;
async function loadMealsPage() {
  if (!currentUser) return;
  // Debounce: cancel any pending load triggered within 50ms
  if (_mealsLoadTimer) { clearTimeout(_mealsLoadTimer); _mealsLoadTimer = null; }
  updateMealsDateLabel();
  var range = getMealsDateRange();
  var today = localDateStr(mealsDate);

  try {
    // Ensure we have a valid session token
    var session = currentSession || getSession();
    if (!session || !session.access_token) {
      document.getElementById('meals-list').innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-state-icon">🍽</div><div class="empty-state-text">Session expired. Please refresh.</div></div>';
      return;
    }
    // Fetch meals for the selected date range (with buffer for timezone shifts)
    var fetchStart = new Date(range.start); fetchStart.setDate(fetchStart.getDate() - 1);
    var fetchEnd   = new Date(range.end);   fetchEnd.setDate(fetchEnd.getDate() + 1);
    var meals = await supabaseRequest(
      '/rest/v1/meal_log?select=id,meal_type,meal_time,meal_description,created_at,data&user_id=eq.' + currentUser.id
        + '&created_at=gte.' + fetchStart.toISOString()
        + '&created_at=lte.' + fetchEnd.toISOString()
        + '&order=created_at.desc&limit=500',
      'GET', null, session.access_token
    );
    if (!meals || meals.error || !Array.isArray(meals)) {
      console.log('[Healix] meals fetch failed or empty:', meals);
      document.getElementById('meals-list').innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-state-icon">🍽</div><div class="empty-state-text">No meals logged yet.</div></div>';
      return;
    }
    console.log('[Healix] meals fetched:', meals.length, 'mealsDate=', localDateStr(mealsDate));
    window._healixMeals = meals; // debug: call debugMealData(window._healixMeals[0]) in console
    // Auto-log ALL nutrition fields from first meal that has data
    var sampleMeal = meals.find(function(m) { return m.data; });
    if (sampleMeal) {
      var d = null;
      try { d = typeof sampleMeal.data === 'string' ? JSON.parse(sampleMeal.data) : sampleMeal.data; } catch(e) {}
      if (d && d.total_nutrition) {
        Object.keys(d.total_nutrition).forEach(function(cat) {
          var items = d.total_nutrition[cat];
          if (Array.isArray(items)) {
            console.log('[Healix] ' + cat + ':', items.map(function(x){ return x.name + '=' + x.value + (x.unit||''); }).join(', '));
          }
        });
      } else {
        console.log('[Healix] meal.data keys:', d ? Object.keys(d) : 'null');
      }
    }

    // Fetch nutrients
    var nutrients = [];
    if (meals.length > 0) {
      var ids = meals.map(function(m) { return m.id; }).join(',');
      var nutrientData = await supabaseRequest(
        '/rest/v1/meal_nutrient?meal_log_id=in.(' + ids + ')&select=meal_log_id,category,name,value',
        'GET', null, currentSession.access_token
      ).catch(function() { return []; });
      if (Array.isArray(nutrientData)) nutrients = nutrientData;
    }

    if (mealsView === 'day') {
      renderMealsDayView(meals, nutrients, today);
      loadSupplements();
    } else {
      renderMealsAggregateView(meals, nutrients, range);
    }
  } catch(e) { console.error('Meals page error:', e); }
}

function getNutrientFromData(mealData, name) {
  if (!mealData || !mealData.total_nutrition) return null;
  var nameLower = name.toLowerCase();
  var categories = Object.values(mealData.total_nutrition);
  // First pass: exact match
  for (var i = 0; i < categories.length; i++) {
    var cat = categories[i];
    if (!Array.isArray(cat)) continue;
    for (var j = 0; j < cat.length; j++) {
      if (cat[j].name === name) return parseFloat(cat[j].value || 0);
    }
  }
  // Second pass: case-insensitive
  for (var i = 0; i < categories.length; i++) {
    var cat = categories[i];
    if (!Array.isArray(cat)) continue;
    for (var j = 0; j < cat.length; j++) {
      if (cat[j].name && cat[j].name.toLowerCase() === nameLower) return parseFloat(cat[j].value || 0);
    }
  }
  return null;
}

function debugMealData(meal) {
  // Call this from console: debugMealData(meals[0])
  var data = null;
  try { data = typeof meal.data === 'string' ? JSON.parse(meal.data) : meal.data; } catch(e) {}
  if (!data || !data.total_nutrition) { console.log('No total_nutrition in data'); return; }
  Object.keys(data.total_nutrition).forEach(function(cat) {
    var items = data.total_nutrition[cat];
    if (Array.isArray(items)) {
      console.log('Category:', cat);
      items.forEach(function(i) { console.log('  ', i.name, '=', i.value, i.unit); });
    }
  });
}

function getNutrientFirstMatch(mealData, names) {
  // Try multiple possible field names, return first match
  for (var i = 0; i < names.length; i++) {
    var v = getNutrientFromData(mealData, names[i]);
    if (v !== null && v > 0) return v;
  }
  // Last resort: try first match that returns non-null even if 0
  for (var i = 0; i < names.length; i++) {
    var v = getNutrientFromData(mealData, names[i]);
    if (v !== null) return v;
  }
  return null;
}

function getMacrosFromMeal(m) {
  var data = null;
  try { data = typeof m.data === 'string' ? JSON.parse(m.data) : m.data; } catch(e) {}
  return {
    cal:  getNutrientFirstMatch(data, ['Calories','Energy','Calorie','Total Calories']),
    prot: getNutrientFirstMatch(data, ['Protein','Proteins','Total Protein']),
    carb: getNutrientFirstMatch(data, ['Carbohydrates','Total Carbohydrate','Total Carbohydrates','Carbohydrate','Carbs','Net Carbs']),
    fat:  getNutrientFirstMatch(data, ['Fat','Total Fat','Fats','Total Fats'])
  };
}

function renderMealsDayView(meals, nutrients, today) {
  // Filter using localDateStr string comparison - robust against UTC/local timezone issues
  // "today" = localDateStr(mealsDate) passed in from loadMealsPage
  var selectedDateStr = today;
  console.log("[Healix] renderMealsDayView: date=", selectedDateStr, "total meals=", meals.length);

  var dayMeals = meals.filter(function(m) {
    var raw = (m.meal_time && m.meal_time !== null) ? m.meal_time : m.created_at;
    var dt = new Date(raw);
    var ds = localDateStr(dt);
    return ds === selectedDateStr;
  });

  console.log("[Healix] dayMeals after filter:", dayMeals.length);
  if (meals.length > 0) { console.log("[Healix] sample:", meals.slice(0,3).map(function(m){ return (m.meal_time||m.created_at) + " -> " + localDateStr(new Date(m.meal_time||m.created_at)); })); }

  var emojis = { breakfast:'🍳', lunch:'🥗', dinner:'🍽', snack:'🍎', cooked:'🍳', drink:'🥤', dessert:'🍰', supplement:'💊' };
  var list = document.getElementById('meals-list');

  if (dayMeals.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-state-icon">🍽</div><div class="empty-state-text">No meals logged on this day.</div></div>';
  } else {
    // Group nutrients by meal
    var nutrientsByMeal = {};
    nutrients.forEach(function(n) {
      if (!nutrientsByMeal[n.meal_log_id]) nutrientsByMeal[n.meal_log_id] = {};
      var existing = nutrientsByMeal[n.meal_log_id][n.name] || 0;
      if (parseFloat(n.value || 0) > existing) nutrientsByMeal[n.meal_log_id][n.name] = parseFloat(n.value || 0);
    });

    list.innerHTML = dayMeals.map(function(m) {
      var dt = new Date(m.meal_time || m.created_at);
      var mealType = (m.meal_type || '').toLowerCase();
      // Always read from meal_log.data for consistency with macro totals
      var macros = getMacrosFromMeal(m);
      var cal  = macros.cal  !== null ? Math.round(macros.cal)  : null;
      var prot = macros.prot !== null ? Math.round(macros.prot) : null;
      var carb = macros.carb !== null ? Math.round(macros.carb) : null;
      var fat  = macros.fat  !== null ? Math.round(macros.fat)  : null;
      return '<div class="meal-card">'
        + '<div class="meal-card-emoji">' + (emojis[mealType] || '🥘') + '</div>'
        + '<div class="meal-card-info">'
        + '<div class="meal-card-name">' + (m.meal_description || 'Meal') + '</div>'
        + '<div class="meal-card-time">' + (m.meal_type ? m.meal_type.charAt(0).toUpperCase()+m.meal_type.slice(1) : '') + ' · ' + dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) + '</div>'
        + '<div class="meal-card-macros">'
        + (prot !== null ? '<div class="meal-card-macro">P <span>' + prot + 'g</span></div>' : '')
        + (carb !== null ? '<div class="meal-card-macro">C <span>' + carb + 'g</span></div>' : '')
        + (fat  !== null ? '<div class="meal-card-macro">F <span>' + fat  + 'g</span></div>' : '')
        + '</div></div>'
        + '<div class="meal-card-cals">' + (cal || '—') + '</div>'
        + '</div>';
    }).join('');
  }

  // Day totals — always use meal_log.data as source of truth for macros.
  // meal_nutrient table may have stale or partial data so we skip it for macro totals.
  renderMacrosFromMealData(dayMeals);

  // Micronutrients — includes supplement contributions when available
  renderMicronutrientsWithSupplements(dayMeals);
}

function renderMealsAggregateView(meals, nutrients, range) {
  // Group meals by local date
  var byDay = {};
  meals.forEach(function(m) {
    var d = localDateStr(new Date(m.meal_time || m.created_at));
    if (!byDay[d]) byDay[d] = { meals: [] };
    byDay[d].meals.push(m);
  });

  // Only show days within the selected range
  var rangeStart = localDateStr(range.start);
  var rangeEnd   = localDateStr(range.end);
  var days = Object.keys(byDay).filter(function(d) { return d >= rangeStart && d <= rangeEnd; }).sort();
  var numDays = Math.max(days.length, 1);

  function dayMacroTotal(d, macroKey) {
    var total = 0;
    (byDay[d] ? byDay[d].meals : []).forEach(function(m) {
      var macros = getMacrosFromMeal(m);
      total += macros[macroKey] || 0;
    });
    return Math.round(total);
  }

  var calsByDay  = days.map(function(d) { return dayMacroTotal(d, 'cal'); });
  var protByDay  = days.map(function(d) { return dayMacroTotal(d, 'prot'); });
  var carbsByDay = days.map(function(d) { return dayMacroTotal(d, 'carb'); });
  var fatsByDay  = days.map(function(d) { return dayMacroTotal(d, 'fat'); });

  var avgCal  = Math.round(calsByDay.reduce(function(s,v){return s+v;},0) / numDays);
  var avgProt = Math.round(protByDay.reduce(function(s,v){return s+v;},0) / numDays);
  var avgCarb = Math.round(carbsByDay.reduce(function(s,v){return s+v;},0) / numDays);
  var avgFat  = Math.round(fatsByDay.reduce(function(s,v){return s+v;},0) / numDays);

  // Update top macro cards with avg label
  var periodLabel = mealsView === 'week' ? 'this week' : 'this month';
  document.getElementById('mp-cal').textContent  = avgCal || '—';
  document.getElementById('mp-cal-sub').textContent = 'avg/day ' + periodLabel;
  document.getElementById('mp-protein').innerHTML = (avgProt || '—') + '<span style="font-size:16px;color:var(--muted)">g</span>';
  document.getElementById('mp-prot-sub').textContent = 'avg/day protein';
  document.getElementById('mp-carbs').innerHTML   = (avgCarb || '—') + '<span style="font-size:16px;color:var(--muted)">g</span>';
  document.getElementById('mp-carb-sub').textContent = 'avg/day carbs';
  document.getElementById('mp-fat').innerHTML     = (avgFat || '—') + '<span style="font-size:16px;color:var(--muted)">g</span>';
  document.getElementById('mp-fat-sub').textContent = 'avg/day fat';

  // Avg macro cards
  document.getElementById('agg-cal').textContent     = avgCal || '—';
  document.getElementById('agg-protein').innerHTML   = (avgProt || '—') + '<span style="font-size:14px;color:var(--muted)">g</span>';
  document.getElementById('agg-carbs').innerHTML     = (avgCarb || '—') + '<span style="font-size:14px;color:var(--muted)">g</span>';
  document.getElementById('agg-fat').innerHTML       = (avgFat || '—') + '<span style="font-size:14px;color:var(--muted)">g</span>';



  // Calorie bar chart with date labels
  var calChart = document.getElementById('agg-cal-chart');
  var calDates = document.getElementById('agg-cal-dates');
  if (calChart) {
    var maxCal = Math.max.apply(null, calsByDay.concat([1]));
    var calGoal = 2000;
    calChart.style.display = 'flex';
    calChart.style.alignItems = 'flex-end';
    calChart.style.gap = '3px';
    calChart.innerHTML = calsByDay.map(function(v, i) {
      var pct = Math.max(4, Math.round(v / Math.max(maxCal, calGoal) * 100));
      var overGoal = v > calGoal;
      var color = overGoal ? 'var(--down)' : 'var(--gold)';
      var dt = new Date(days[i] + 'T12:00:00');
      var label = mealsView === 'month'
        ? dt.toLocaleDateString('en-US',{day:'numeric'})
        : dt.toLocaleDateString('en-US',{weekday:'short'});
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer" title="' + v + ' cal" onclick="drillToDay(\'' + days[i] + '\')">'
        + '<div style="width:100%;background:' + color + ';height:' + pct + '%;min-height:3px;border-radius:2px 2px 0 0;transition:height .4s"></div>'
        + '</div>';
    }).join('');
    if (calDates) {
      // Show first, middle, last labels only (avoid crowding)
      calDates.style.display = 'flex';
      calDates.style.justifyContent = 'space-between';
      calDates.innerHTML = days.map(function(d, i) {
        var dt = new Date(d + 'T12:00:00');
        var showLabel = (i === 0 || i === days.length - 1 || (days.length <= 14 && mealsView === 'week') || i % 7 === 0);
        return '<span style="font-size:9px;color:' + (showLabel ? 'var(--muted)' : 'transparent') + ';flex:1;text-align:' + (i===0?'left':i===days.length-1?'right':'center') + '">'
          + (showLabel ? dt.toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '·') + '</span>';
      }).join('');
    }
  }

  // Period label
  var aggLabel = document.getElementById('agg-period-label');
  if (aggLabel) aggLabel.textContent = mealsView === 'week' ? '· this week' : '· this month';

  // Daily breakdown table
  var breakdown = document.getElementById('agg-daily-breakdown');
  if (!breakdown) return;
  if (days.length === 0) {
    breakdown.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">No meals logged in this period.</div>';
    return;
  }
  breakdown.innerHTML = '<table style="width:100%;border-collapse:collapse">'
    + '<thead><tr style="border-bottom:1px solid var(--gold-border)">'
    + ['Date','Calories','Protein','Carbs','Fat','Meals'].map(function(h) {
        return '<th style="text-align:left;padding:10px 0;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);font-weight:400">' + h + '</th>';
      }).join('')
    + '</tr></thead><tbody>'
    + days.slice().reverse().map(function(d, i) {
        var ri = days.length - 1 - i;
        var dt = new Date(d + 'T12:00:00');
        var isToday = d === localDateStr(new Date());
        var overGoal = calsByDay[ri] > 2000;
        return '<tr style="border-bottom:1px solid rgba(184,151,90,.06);cursor:pointer" onclick="drillToDay(\'' + d + '\')" onmouseover="this.style.background=\'var(--gold-faint)\'" onmouseout="this.style.background=\'\'">'

          + '<td style="padding:11px 0;font-size:13px;color:' + (isToday ? 'var(--gold)' : 'var(--cream)') + '">' + dt.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) + '</td>'
          + '<td style="padding:11px 0;font-family:var(--F);font-size:18px;font-weight:300;color:' + (overGoal ? 'var(--down)' : 'var(--cream)') + '">' + (calsByDay[ri] || '—') + '</td>'
          + '<td style="padding:11px 0;font-size:13px;color:var(--cream-dim)">' + (protByDay[ri] || '—') + 'g</td>'
          + '<td style="padding:11px 0;font-size:13px;color:var(--cream-dim)">' + (carbsByDay[ri] || '—') + 'g</td>'
          + '<td style="padding:11px 0;font-size:13px;color:var(--cream-dim)">' + (fatsByDay[ri] || '—') + 'g</td>'
          + '<td style="padding:11px 0;font-size:13px;color:var(--muted)">' + (byDay[d] ? byDay[d].meals.length : 0) + '</td>'
          + '</tr>';
      }).join('')
    + '</tbody></table>';

  // Micronutrients — sum across all meals in range, show avg % of RDA
  var rangeMeals = days.reduce(function(acc, d) {
    return acc.concat(byDay[d] ? byDay[d].meals : []);
  }, []);
  var aggMicroPanel = document.getElementById('agg-micro-panel');
  if (rangeMeals.length > 0) {
    var microTotals = getMicroTotalsFromMeals(rangeMeals);
    var hasAny = Object.keys(microTotals).length > 0;
    if (aggMicroPanel) aggMicroPanel.style.display = hasAny ? 'block' : 'none';
    if (hasAny) {
      // Average each nutrient across the number of days that had meals
      var daysWithMeals = days.filter(function(d) { return byDay[d] && byDay[d].meals.length > 0; }).length || 1;
      var avgTotals = {};
      Object.keys(microTotals).forEach(function(k) {
        avgTotals[k] = microTotals[k] / daysWithMeals;
      });
      renderMicroPanel(avgTotals, 'agg-micro-content');
    }
  } else {
    if (aggMicroPanel) aggMicroPanel.style.display = 'none';
  }
}

async function renderWeightTrendChart(range) {
  if (!currentUser) return;
  try {
    var weightData = await supabaseRequest(
      '/rest/v1/weight_logs?user_id=eq.' + currentUser.id + '&logged_at=gte.' + range.start.toISOString() + '&logged_at=lte.' + range.end.toISOString() + '&order=logged_at.asc',
      'GET', null, currentSession.access_token
    );
    var chart = document.getElementById('agg-weight-chart');
    var dates = document.getElementById('agg-weight-dates');
    if (!weightData || weightData.error || weightData.length === 0) {
      chart.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:16px">No weight entries logged in this period.</div>';
      return;
    }
    var vals = weightData.map(function(w) { return parseFloat(w.value); });
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
    var range2 = max - min || 1;
    chart.innerHTML = vals.map(function(v) {
      var pct = Math.max(10, Math.round(((v - min) / range2) * 80) + 10);
      return '<div style="flex:1;background:var(--gold);height:' + pct + '%;min-height:4px"></div>';
    }).join('');
    chart.style.display = 'flex';
    chart.style.alignItems = 'flex-end';
    chart.style.gap = '4px';
    dates.innerHTML = weightData.map(function(w) {
      var dt = new Date(w.logged_at || w.created_at);
      return '<span style="font-size:9px;color:var(--muted)">' + dt.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + '</span>';
    }).join('');
  } catch(e) {}
}

function drillToDay(dateStr) {
  var d = new Date(dateStr + 'T12:00:00');
  mealsDate = d;
  pageSelectedDate['meals'] = d;
  setMealsView('day', document.getElementById('meals-view-day'));
  updateDateNav('meals');
}


function setMealDateTimeDefault() {
  var now = new Date();
  // Format as YYYY-MM-DDTHH:MM for datetime-local input
  var y = now.getFullYear();
  var mo = String(now.getMonth() + 1).padStart(2, '0');
  var d = String(now.getDate()).padStart(2, '0');
  var h = String(now.getHours()).padStart(2, '0');
  var mi = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('ml-datetime').value = y + '-' + mo + '-' + d + 'T' + h + ':' + mi;
}

async function saveMeal() {
  var name = document.getElementById('ml-name').value;
  var type = document.getElementById('ml-type').value;
  var dt = document.getElementById('ml-datetime').value;
  var cals = document.getElementById('ml-cals').value;
  var prot = document.getElementById('ml-protein').value;
  var carbs = document.getElementById('ml-carbs').value;
  var fat = document.getElementById('ml-fat').value;
  if (!name) { alert('Please enter a meal name.'); return; }
  var mealTime = dt ? new Date(dt).toISOString() : new Date().toISOString();
  try {
    var mealRes = await supabaseRequest('/rest/v1/meal_log', 'POST', {
      user_id: currentUser.id, meal_type: type,
      meal_description: name, meal_time: mealTime
    }, currentSession.access_token);
    closeModal('meal-modal');
    ['ml-name','ml-cals','ml-protein','ml-carbs','ml-fat'].forEach(function(id) { document.getElementById(id).value = ''; });
    loadDashboardData();
  } catch(e) { alert('Could not save meal: ' + e.message); }
}

// ── SUPPLEMENTS ──
var userSupplements = [];
var supplementLogsToday = {}; // { supplementId: true }

async function loadSupplements() {
  if (!currentUser || !currentSession) return;
  var token = currentSession.access_token;
  var today = localDateStr(mealsDate);
  try {
    var supps = await supabaseRequest(
      '/rest/v1/user_supplements?user_id=eq.' + currentUser.id + '&is_active=eq.true&order=sort_order,created_at',
      'GET', null, token
    );
    userSupplements = Array.isArray(supps) ? supps : [];

    // Fetch today's logs
    supplementLogsToday = {};
    if (userSupplements.length > 0) {
      var logs = await supabaseRequest(
        '/rest/v1/supplement_logs?user_id=eq.' + currentUser.id + '&logged_date=eq.' + today,
        'GET', null, token
      );
      if (Array.isArray(logs)) {
        logs.forEach(function(l) { supplementLogsToday[l.supplement_id] = l.id; });
      }
    }
    renderSupplements();

    // Auto-detect from meal history if no supplements defined
    if (userSupplements.length === 0 && window._healixMeals && window._healixMeals.length > 0) {
      detectSupplementsFromHistory(window._healixMeals);
    }
  } catch(e) { console.error('[Healix] loadSupplements error:', e); }
}

function renderSupplements() {
  var container = document.getElementById('supplements-stack');
  if (!container) return;
  if (userSupplements.length === 0) {
    container.innerHTML = '<div style="font-size:12px;color:var(--muted)">No supplements added yet. Tap + ADD to define your stack.</div>';
    return;
  }
  container.innerHTML = userSupplements.map(function(s) {
    var taken = !!supplementLogsToday[s.id];
    var dosageText = s.dosage ? ' <span style="font-size:11px;color:var(--muted)">(' + s.dosage + ')</span>' : '';
    return '<button class="supp-pill' + (taken ? ' taken' : '') + '" onclick="toggleSupplement(\'' + s.id + '\')">'
      + '<span class="supp-check">' + (taken ? '✓' : '○') + '</span>'
      + '<span>' + s.name + dosageText + '</span>'
      + '<span class="supp-remove" onclick="event.stopPropagation(); removeSupplement(\'' + s.id + '\')">✕</span>'
      + '</button>';
  }).join('');
}

async function toggleSupplement(suppId) {
  if (!currentUser || !currentSession) return;
  var token = currentSession.access_token;
  var today = localDateStr(mealsDate);
  try {
    if (supplementLogsToday[suppId]) {
      // Remove log
      await supabaseRequest(
        '/rest/v1/supplement_logs?id=eq.' + supplementLogsToday[suppId],
        'DELETE', null, token
      );
      delete supplementLogsToday[suppId];
    } else {
      // Add log
      var result = await supabaseRequest('/rest/v1/supplement_logs', 'POST', {
        user_id: currentUser.id,
        supplement_id: suppId,
        logged_date: today
      }, token);
      // Fetch the created ID
      var logs = await supabaseRequest(
        '/rest/v1/supplement_logs?user_id=eq.' + currentUser.id + '&supplement_id=eq.' + suppId + '&logged_date=eq.' + today,
        'GET', null, token
      );
      if (Array.isArray(logs) && logs.length > 0) {
        supplementLogsToday[suppId] = logs[0].id;
      }
    }
    renderSupplements();
    // Re-render micronutrients to include/exclude supplement contributions
    if (window._healixMeals) {
      renderMicronutrientsWithSupplements(window._healixMeals);
    }
  } catch(e) { console.error('[Healix] toggleSupplement error:', e); }
}

async function saveSupplement() {
  var nameEl = document.getElementById('supp-name');
  var dosageEl = document.getElementById('supp-dosage');
  var statusEl = document.getElementById('supp-status');
  var saveBtn = document.getElementById('supp-save-btn');
  var name = nameEl.value.trim();
  var dosage = dosageEl.value.trim();
  if (!name) { alert('Please enter a supplement name.'); return; }

  statusEl.style.display = 'block';
  statusEl.textContent = 'Looking up nutrient profile...';
  saveBtn.disabled = true;

  try {
    // Call analyze-meal-ai to get nutrient profile
    var nutrientProfile = null;
    try {
      var desc = dosage ? dosage + ' ' + name : name;
      var aiRes = await fetch(SUPABASE_URL + '/functions/v1/analyze-meal-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentSession.access_token },
        body: JSON.stringify({ mealLog: desc, meal_type: 'Cooked' })
      });
      if (aiRes.ok) {
        var aiData = await aiRes.json();
        if (aiData && aiData.total_nutrition) {
          nutrientProfile = aiData.total_nutrition;
        }
      }
    } catch(e) { console.warn('[Healix] Could not fetch nutrient profile:', e); }

    statusEl.textContent = 'Saving supplement...';

    await supabaseRequest('/rest/v1/user_supplements', 'POST', {
      user_id: currentUser.id,
      name: name,
      dosage: dosage || null,
      nutrient_profile: nutrientProfile,
      is_active: true,
      sort_order: userSupplements.length
    }, currentSession.access_token);

    closeModal('supplement-modal');
    nameEl.value = '';
    dosageEl.value = '';
    statusEl.style.display = 'none';
    saveBtn.disabled = false;
    await loadSupplements();
  } catch(e) {
    statusEl.textContent = 'Error: ' + e.message;
    saveBtn.disabled = false;
  }
}

async function removeSupplement(suppId) {
  var confirmed = await confirmModal('Remove this supplement from your stack?', { title: 'Remove Supplement', confirmText: 'Remove', danger: true });
  if (!confirmed) return;
  try {
    await supabaseRequest(
      '/rest/v1/user_supplements?id=eq.' + suppId,
      'PATCH', { is_active: false }, currentSession.access_token
    );
    await loadSupplements();
    if (window._healixMeals) renderMicronutrientsWithSupplements(window._healixMeals);
  } catch(e) { console.error('[Healix] removeSupplement error:', e); }
}

function getSupplementMicroTotals() {
  var totals = {};
  userSupplements.forEach(function(s) {
    if (!supplementLogsToday[s.id]) return; // not taken today
    if (!s.nutrient_profile) return;
    Object.values(s.nutrient_profile).forEach(function(cat) {
      if (!Array.isArray(cat)) return;
      cat.forEach(function(item) {
        var def = MICRO_ALIAS_MAP[item.name];
        if (!def) return;
        var val = parseFloat(item.value || 0);
        if (!val) return;
        if (def.iuToMcg && item.unit && item.unit.toLowerCase().indexOf('iu') !== -1) {
          val = val / def.iuToMcg;
        }
        totals[def.key] = (totals[def.key] || 0) + val;
      });
    });
  });
  return totals;
}

function renderMicronutrientsWithSupplements(meals) {
  var panel = document.getElementById('meals-micro-panel');
  if (!panel) return;
  var mealTotals = getMicroTotalsFromMeals(meals);
  var suppTotals = getSupplementMicroTotals();
  // Merge supplement totals into meal totals
  Object.keys(suppTotals).forEach(function(k) {
    mealTotals[k] = (mealTotals[k] || 0) + suppTotals[k];
  });
  var hasAny = Object.keys(mealTotals).length > 0;
  panel.style.display = hasAny ? 'block' : 'none';
  if (hasAny) renderMicroPanel(mealTotals, 'meals-micro-content');
}

function detectSupplementsFromHistory(meals) {
  var keywords = ['supplement', 'vitamin', 'gummy', 'gummies', 'capsule', 'tablet',
    'creatine', 'fish oil', 'omega', 'multivitamin', 'probiotic', 'magnesium supplement',
    'zinc supplement', 'emergen-c', 'collagen', 'centrum', 'melatonin', 'ashwagandha',
    'protein powder', 'whey protein'];
  var found = {};
  meals.forEach(function(m) {
    if (!m.meal_description) return;
    var desc = m.meal_description.toLowerCase();
    keywords.forEach(function(kw) {
      if (desc.indexOf(kw) !== -1 && !found[kw]) {
        // Extract a meaningful name from the description
        found[kw] = m.meal_description.length > 60 ? m.meal_description.substring(0, 57) + '...' : m.meal_description;
      }
    });
  });
  var suggestions = Object.values(found);
  if (suggestions.length === 0) return;

  var sugSection = document.getElementById('supplements-suggestions');
  var sugList = document.getElementById('supp-suggestions-list');
  if (!sugSection || !sugList) return;
  sugSection.style.display = 'block';
  sugList.innerHTML = suggestions.slice(0, 5).map(function(s) {
    return '<button class="supp-suggestion" onclick="prefillSupplement(this)" data-desc="' + s.replace(/"/g, '&quot;') + '">'
      + '<span>+</span> ' + s + '</button>';
  }).join('');
}

function prefillSupplement(el) {
  var desc = el.getAttribute('data-desc');
  document.getElementById('supp-name').value = desc;
  openModal('supplement-modal');
}

// ── DOCUMENTS ──
var uploadedDocs = [];

async function loadDocumentsPage() {
  var grid = document.getElementById('docs-grid');
  if (!currentUser) return;
  grid.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:24px 0">Loading…</div>';
  try {
    var docs = await supabaseRequest(
      '/rest/v1/uploads?user_id=eq.' + currentUser.id + '&order=created_at.desc',
      'GET', null, currentSession.access_token
    );
    console.log('[Healix] uploads fetch:', docs ? (docs.error ? 'ERROR:'+JSON.stringify(docs.error) : docs.length + ' docs') : 'null');
    if (!docs || docs.error || docs.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:span 3;padding:40px"><div class="empty-state-icon">📄</div><div class="empty-state-text">No documents uploaded yet.<br>Upload bloodwork or lab results for AI analysis.</div></div>';
      return;
    }
    grid.innerHTML = docs.map(function(doc) {
      var icon = doc.file_type === 'application/pdf' ? '📄' : '🖼';
      var sizeStr = doc.file_size > 1024*1024 ? (doc.file_size/(1024*1024)).toFixed(1) + ' MB' : (doc.file_size/1024).toFixed(0) + ' KB';
      var dateStr = new Date(doc.created_at).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
      var tag = doc.document_type === 'blood_work' ? 'Bloodwork' : doc.file_type === 'application/pdf' ? 'PDF' : 'Image';
      var statusStyle = doc.status === 'error' ? 'background:rgba(220,50,50,0.15);color:#e55' : doc.status === 'processing' ? 'background:rgba(184,151,90,0.12);color:var(--gold-light)' : '';
      var statusLabel = doc.status === 'error' ? '<div style="font-size:10px;color:#e55;margin-top:4px">Processing error</div>' : doc.status === 'processing' ? '<div style="font-size:10px;color:var(--gold);margin-top:4px">Processing…</div>' : '';
      return '<div class="doc-card" style="position:relative;' + statusStyle + '">'
        + '<button class="doc-card-delete" onclick="event.stopPropagation();deleteDocument(\'' + doc.id + '\',\'' + (doc.file_url || '').replace(/'/g, "\\'") + '\')" title="Delete document">&times;</button>'
        + '<div class="doc-card-icon">' + icon + '</div>'
        + '<div class="doc-card-name">' + (doc.title || 'Untitled') + '</div>'
        + '<div class="doc-card-meta">' + sizeStr + ' · ' + dateStr + '</div>'
        + '<div class="doc-card-tag">' + tag + '</div>'
        + statusLabel
        + '</div>';
    }).join('');
  } catch(e) {
    console.error('Documents load error:', e);
    grid.innerHTML = '<div class="empty-state" style="grid-column:span 3;padding:40px"><div class="empty-state-icon">📄</div><div class="empty-state-text">No documents uploaded yet.<br>Upload bloodwork or lab results for AI analysis.</div></div>';
  }
}

var DOC_BUCKET = 'documents';

async function handleDocUpload(input) {
  var files = Array.from(input.files);
  if (!files.length || !currentUser) return;
  var grid = document.getElementById('docs-grid');

  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    var path = currentUser.id + '/' + Date.now() + '_' + safeName;

    // Optimistic UI — show uploading card
    var tempId = 'upload-temp-' + Date.now() + i;
    var emptyState = grid.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    grid.insertAdjacentHTML('afterbegin',
      '<div class="doc-card" id="' + tempId + '" style="opacity:0.6">'
      + '<div class="doc-card-icon">⏳</div>'
      + '<div class="doc-card-name">' + file.name + '</div>'
      + '<div class="doc-card-meta">Uploading…</div>'
      + '</div>'
    );

    try {
      // Upload file to Supabase Storage
      var uploadRes = await fetch(SUPABASE_URL + '/storage/v1/object/' + DOC_BUCKET + '/' + path, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + currentSession.access_token,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': file.type,
          'x-upsert': 'true'
        },
        body: file
      });
      if (!uploadRes.ok) {
        var errText = await uploadRes.text();
        throw new Error('Storage: ' + uploadRes.status + ' ' + errText);
      }

      // Insert metadata row in uploads table (status: processing)
      var inserted = await supabaseRequest('/rest/v1/uploads', 'POST', {
        user_id: currentUser.id,
        title: file.name.replace(/\.[^.]+$/, ''),
        file_url: path,
        file_type: file.type,
        file_size: file.size,
        status: 'processing',
        metadata: { original_filename: file.name }
      }, currentSession.access_token, { 'Prefer': 'return=representation' });

      var upload_id = inserted && inserted[0] && inserted[0].id;

      // Update temp card to processing
      var tempCard = document.getElementById(tempId);
      if (tempCard) {
        var icon = file.type === 'application/pdf' ? '📄' : '🖼';
        tempCard.style.opacity = '0.8';
        tempCard.querySelector('.doc-card-icon').textContent = icon;
        tempCard.querySelector('.doc-card-meta').textContent = 'Processing…';
      }

      // Call process-document edge function
      if (upload_id) {
        try {
          await supabaseRequest('/functions/v1/process-document', 'POST', { upload_id: upload_id }, currentSession.access_token);
        } catch(procErr) {
          console.error('process-document error:', procErr);
        }
      }

      // Update temp card to success
      if (tempCard) {
        tempCard.style.opacity = '1';
        tempCard.querySelector('.doc-card-meta').textContent = 'Uploaded just now';
      }
    } catch(e) {
      console.error('Upload error:', e);
      var tempCard = document.getElementById(tempId);
      if (tempCard) {
        tempCard.style.opacity = '1';
        tempCard.style.background = 'rgba(220,50,50,0.1)';
        tempCard.querySelector('.doc-card-icon').textContent = '⚠';
        tempCard.querySelector('.doc-card-meta').textContent = 'Upload failed';
      }
    }
  }
  input.value = '';
  // Refresh from server
  loadDocumentsPage();
}

async function deleteDocument(uploadId, filePath) {
  var confirmed = await confirmModal('This document and its extracted data will be permanently deleted.', { title: 'Delete Document', confirmText: 'Delete', danger: true });
  if (!confirmed) return;
  try {
    // Delete file from storage bucket
    if (filePath) {
      await fetch(SUPABASE_URL + '/storage/v1/object/' + DOC_BUCKET + '/' + filePath, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + currentSession.access_token,
          'apikey': SUPABASE_ANON_KEY
        }
      });
    }
    // Delete row from uploads table
    await supabaseRequest(
      '/rest/v1/uploads?id=eq.' + uploadId,
      'DELETE', null, currentSession.access_token
    );
    // Refresh the documents list
    loadDocumentsPage();
  } catch(e) {
    console.error('Delete document error:', e);
    confirmModal('Failed to delete document. Please try again.', { title: 'Error', confirmText: 'OK', cancelText: '' });
  }
}

// ── FAMILY HISTORY ──
var familyHistory = {};

var conditions = [
  'Heart disease', 'High blood pressure', 'High cholesterol', 'Stroke',
  'Type 2 Diabetes', 'Type 1 Diabetes',
  'Cancer — Breast', 'Cancer — Colon', 'Cancer — Lung', 'Cancer — Prostate', 'Cancer — Other',
  'Alzheimer\'s / Dementia', 'Parkinson\'s disease',
  'Asthma', 'COPD / Emphysema',
  'Depression', 'Bipolar disorder', 'Schizophrenia', 'Anxiety disorder', 'Substance abuse / Alcoholism',
  'Autoimmune disorder (Lupus, RA, MS)',
  'Thyroid disorders', 'Osteoporosis', 'Arthritis',
  'Kidney disease', 'Liver disease',
  'Sickle cell disease', 'Blood clotting disorder',
  'Epilepsy / Seizure disorder',
  'Obesity', 'Eating disorder',
  'Glaucoma', 'Macular degeneration',
  'Congenital heart defect', 'Sudden cardiac death'
];
var members = ['Parent', 'Sibling', 'Grandparent'];

function loadFamilyHistoryForm() {
  var form = document.getElementById('fh-form');
  form.innerHTML = conditions.map(function(cond) {
    return '<div class="fh-item">'
      + '<div class="fh-condition">' + cond + '</div>'
      + '<div class="fh-members">'
      + members.map(function(m) {
          return '<div class="fh-tag" data-cond="' + cond + '" data-member="' + m + '" onclick="toggleFH(this)">' + m + '</div>';
        }).join('')
      + '</div></div>';
  }).join('');
}

function toggleFH(el) {
  el.classList.toggle('active');
  var cond = el.getAttribute('data-cond');
  var member = el.getAttribute('data-member');
  if (!familyHistory[cond]) familyHistory[cond] = [];
  var idx = familyHistory[cond].indexOf(member);
  if (idx > -1) familyHistory[cond].splice(idx, 1);
  else familyHistory[cond].push(member);
}

async function saveFamilyHistory() {
  if (!currentUser) return;
  try {
    await supabaseRequest('/rest/v1/profiles?auth_user_id=eq.' + currentUser.id, 'PATCH', {
      family_history: JSON.stringify(familyHistory)
    }, currentSession.access_token);
    alert('Family history saved.');
  } catch(e) { alert('Could not save family history: ' + e.message); console.error(e); }
}

function populateProfileForm(profile) {
  var fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  if (fullName) document.getElementById('p-name').value = fullName;
  if (profile.birth_date) document.getElementById('p-dob').value = profile.birth_date;
  if (profile.gender) document.getElementById('p-sex').value = profile.gender;
  if (profile.primary_goal) document.getElementById('p-goal').value = profile.primary_goal;
  // Height: stored as cm, display as feet/inches
  if (profile.height_cm) {
    var totalInches = profile.height_cm / 2.54;
    var feet = Math.floor(totalInches / 12);
    var inches = Math.round(totalInches % 12);
    document.getElementById('p-height').value = feet + "'" + inches + '"';
  }
  // Weight: stored as kg, display as lbs
  if (profile.current_weight_kg) {
    document.getElementById('p-weight').value = Math.round(profile.current_weight_kg * 2.205);
  }
  // Load health conditions
  if (profile.health_conditions) {
    var conds = profile.health_conditions.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    conds.forEach(function(c) {
      // Fuzzy match: check if stored value starts with a preset name
      var matched = false;
      conditionPresets.forEach(function(p) {
        if (c.toLowerCase().indexOf(p.toLowerCase()) === 0 || p.toLowerCase().indexOf(c.toLowerCase()) === 0) {
          var preset = document.querySelector('#condition-presets [data-val="' + p + '"]');
          if (preset) { preset.classList.add('active'); medicalProfile.conditions.push(p); matched = true; }
        }
      });
      if (!matched) medicalProfile.conditions.push(c);
    });
    renderCustomTags('custom-condition-tags', medicalProfile.conditions.filter(function(c) {
      return conditionPresets.indexOf(c) === -1;
    }), 'condition');
  }
  // Load dietary restrictions / allergies
  if (profile.dietary_restrictions) {
    var allergies = profile.dietary_restrictions.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    allergies.forEach(function(a) {
      var matched = false;
      allergyPresets.forEach(function(p) {
        if (a.toLowerCase().indexOf(p.toLowerCase()) === 0 || p.toLowerCase().indexOf(a.toLowerCase()) === 0) {
          var preset = document.querySelector('#allergy-presets [data-val="' + p + '"]');
          if (preset) { preset.classList.add('active'); medicalProfile.allergies.push(p); matched = true; }
        }
      });
      if (!matched) medicalProfile.allergies.push(a);
    });
    renderCustomTags('custom-allergy-tags', medicalProfile.allergies.filter(function(a) {
      return allergyPresets.indexOf(a) === -1;
    }), 'allergy');
  }
}

function parseHeight(val) {
  // Parse formats: 5'11", 5'11, 5 11, 71 (inches), 180cm
  if (!val) return null;
  val = val.trim();
  var cmMatch = val.match(/(\d+)\s*cm/i);
  if (cmMatch) return parseFloat(cmMatch[1]);
  var ftInMatch = val.match(/(\d+)\s*[''′]\s*(\d+)/);
  if (ftInMatch) return (parseInt(ftInMatch[1]) * 12 + parseInt(ftInMatch[2])) * 2.54;
  var ftOnly = val.match(/^(\d+)\s*[''′]$/);
  if (ftOnly) return parseInt(ftOnly[1]) * 12 * 2.54;
  var num = parseFloat(val);
  if (!isNaN(num)) {
    if (num > 100) return num; // Already cm
    return num * 2.54; // Assume inches
  }
  return null;
}

function parseWeight(val) {
  // Parse weight — assume lbs, convert to kg
  if (!val) return null;
  val = val.trim();
  var kgMatch = val.match(/(\d+\.?\d*)\s*kg/i);
  if (kgMatch) return parseFloat(kgMatch[1]);
  var num = parseFloat(val);
  if (!isNaN(num)) return num / 2.205; // lbs to kg
  return null;
}

async function saveProfile() {
  if (!currentUser) return;
  var heightCm = parseHeight(document.getElementById('p-height').value);
  var weightKg = parseWeight(document.getElementById('p-weight').value);
  var nameParts = document.getElementById('p-name').value.trim().split(/\s+/);
  var firstName = nameParts[0] || '';
  var lastName = nameParts.slice(1).join(' ') || '';
  var data = {
    first_name: firstName,
    last_name: lastName,
    primary_goal: document.getElementById('p-goal').value || null,
    birth_date: document.getElementById('p-dob').value || null,
    gender: document.getElementById('p-sex').value || null,
    height_cm: heightCm,
    current_weight_kg: weightKg
  };
  try {
    await supabaseRequest('/rest/v1/profiles?auth_user_id=eq.' + currentUser.id, 'PATCH', data, currentSession.access_token);
    window.userProfileData = Object.assign(window.userProfileData || {}, data);
    alert('Profile saved.');
  } catch(e) { alert('Could not save profile: ' + e.message); console.error('Profile save error:', e); }
}

// ── MODALS ──
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function closeModalOutside(e, id) { if (e.target === document.getElementById(id)) closeModal(id); }
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(function(m) { m.classList.remove('open'); });
});

// ── MEDICAL PROFILE ──
var medicalProfile = { allergies: [], conditions: [], medications: [] };

var allergyPresets = ['Gluten','Dairy','Nuts','Peanuts','Shellfish','Eggs','Soy','Fish','Wheat','Sesame'];
var conditionPresets = ['Type 2 Diabetes','Hypertension','Asthma','Hypothyroidism','IBS','PCOS','Anxiety','Depression','Sleep Apnea','Arthritis'];

function loadMedicalProfileUI() {
  renderPresets('allergy-presets', allergyPresets, 'allergy');
  renderPresets('condition-presets', conditionPresets, 'condition');
}

function renderPresets(containerId, presets, type) {
  var el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = presets.map(function(p) {
    return '<div class="fh-tag" data-type="' + type + '" data-val="' + p + '" onclick="togglePreset(this)">' + p + '</div>';
  }).join('');
}

function togglePreset(el) {
  el.classList.toggle('active');
  var type = el.getAttribute('data-type');
  var val = el.getAttribute('data-val');
  var arr = type === 'allergy' ? medicalProfile.allergies : medicalProfile.conditions;
  var idx = arr.indexOf(val);
  if (idx > -1) arr.splice(idx, 1);
  else arr.push(val);
}

function addCustomTag(inputId, tagsId, type) {
  var input = document.getElementById(inputId);
  var val = input.value.trim();
  if (!val) return;
  var arr = type === 'allergy' ? medicalProfile.allergies : type === 'condition' ? medicalProfile.conditions : medicalProfile.medications;
  if (arr.indexOf(val) === -1) arr.push(val);
  renderCustomTags(tagsId, arr, type);
  input.value = '';
}

function renderCustomTags(containerId, arr, type) {
  var el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = arr.map(function(v, i) {
    return '<div style="display:flex;align-items:center;gap:6px;background:var(--gold-faint);border:1px solid var(--gold-border);padding:4px 10px">'
      + '<span style="font-size:11px;color:var(--cream-dim)">' + v + '</span>'
      + '<span style="font-size:10px;color:var(--muted);cursor:pointer" data-container="' + containerId + '" data-type="' + type + '" data-idx="' + i + '" onclick="removeTagByIdx(this)">✕</span>'
      + '</div>';
  }).join('');
}

function removeTagByIdx(el) {
  var containerId = el.getAttribute("data-container");
  var type = el.getAttribute("data-type");
  var idx = parseInt(el.getAttribute("data-idx"));
  var arr = type === "allergy" ? medicalProfile.allergies : type === "condition" ? medicalProfile.conditions : medicalProfile.medications;
  var val = arr[idx];
  arr.splice(idx, 1);
  renderCustomTags(containerId, arr, type);
  document.querySelectorAll("[data-val=\"" + val + "\"]").forEach(function(e) { e.classList.remove("active"); });
}

function removeTag(containerId, val, type) {
  var arr = type === 'allergy' ? medicalProfile.allergies : type === 'condition' ? medicalProfile.conditions : medicalProfile.medications;
  var idx = arr.indexOf(val);
  if (idx > -1) arr.splice(idx, 1);
  renderCustomTags(containerId, arr, type);
  // Also deactivate preset if it exists
  document.querySelectorAll('[data-val="' + val + '"]').forEach(function(el) { el.classList.remove('active'); });
}

async function saveMedicalProfile() {
  if (!currentUser) return;
  try {
    await supabaseRequest('/rest/v1/profiles?auth_user_id=eq.' + currentUser.id, 'PATCH', {
      health_conditions: medicalProfile.conditions.join(', '),
      dietary_restrictions: medicalProfile.allergies.join(', ')
    }, currentSession.access_token);
    alert('Saved.');
  } catch(e) { alert('Could not save: ' + e.message); console.error(e); }
}

// ── FITNESS ASSESSMENT ──

// Published norm tables (NSCA / Cooper Institute / ACSM)
// Each entry: [threshold, percentile_label]
// Sorted best→worst for strength (higher=better), worst→best for time (lower=better)
var FITNESS_NORMS = {
  // Bench Press 1RM relative to bodyweight — male norms by age (NSCA)
  bench_1rm: {
    label: 'Bench Press', unit: 'lbs', higherBetter: true,
    hint: 'Load a weight you can lift 3-10 times. Go to failure — we calculate your estimated max.',
    norms: {
      male: {
        '18-29': [[1.76,99],[1.34,90],[1.19,80],[1.07,70],[0.99,60],[0.93,50],[0.86,40],[0.79,30],[0.72,20],[0.63,10]],
        '30-39': [[1.54,99],[1.19,90],[1.07,80],[0.99,70],[0.93,60],[0.88,50],[0.81,40],[0.75,30],[0.68,20],[0.60,10]],
        '40-49': [[1.35,99],[1.05,90],[0.96,80],[0.88,70],[0.81,60],[0.76,50],[0.70,40],[0.64,30],[0.58,20],[0.51,10]],
        '50-59': [[1.20,99],[0.93,90],[0.84,80],[0.77,70],[0.72,60],[0.68,50],[0.63,40],[0.57,30],[0.52,20],[0.46,10]],
        '60+':   [[1.10,99],[0.84,90],[0.77,80],[0.70,70],[0.65,60],[0.61,50],[0.57,40],[0.52,30],[0.46,20],[0.40,10]]
      },
      female: {
        '18-29': [[1.01,99],[0.80,90],[0.70,80],[0.63,70],[0.57,60],[0.53,50],[0.49,40],[0.44,30],[0.39,20],[0.33,10]],
        '30-39': [[0.82,99],[0.65,90],[0.58,80],[0.53,70],[0.49,60],[0.45,50],[0.41,40],[0.38,30],[0.34,20],[0.28,10]],
        '40-49': [[0.77,99],[0.61,90],[0.54,80],[0.50,70],[0.45,60],[0.42,50],[0.38,40],[0.35,30],[0.31,20],[0.25,10]],
        '50-59': [[0.68,99],[0.54,90],[0.48,80],[0.44,70],[0.40,60],[0.37,50],[0.33,40],[0.30,30],[0.27,20],[0.21,10]],
        '60+':   [[0.60,99],[0.47,90],[0.43,80],[0.39,70],[0.35,60],[0.33,50],[0.30,40],[0.27,30],[0.24,20],[0.19,10]]
      }
    },
    relativeToWeight: true
  },
  squat_1rm: {
    label: 'Squat', unit: 'lbs', higherBetter: true,
    hint: 'Load a weight you can squat 3-10 times. Go to failure — we estimate your max from that.',
    norms: {
      male: {
        '18-29': [[2.27,99],[1.91,90],[1.74,80],[1.59,70],[1.50,60],[1.42,50],[1.33,40],[1.24,30],[1.14,20],[0.97,10]],
        '30-39': [[2.07,99],[1.71,90],[1.57,80],[1.46,70],[1.38,60],[1.32,50],[1.24,40],[1.16,30],[1.06,20],[0.91,10]],
        '40-49': [[1.92,99],[1.57,90],[1.44,80],[1.35,70],[1.26,60],[1.20,50],[1.13,40],[1.06,30],[0.97,20],[0.83,10]],
        '50-59': [[1.75,99],[1.43,90],[1.32,80],[1.22,70],[1.15,60],[1.09,50],[1.02,40],[0.95,30],[0.87,20],[0.74,10]],
        '60+':   [[1.55,99],[1.26,90],[1.16,80],[1.07,70],[1.00,60],[0.94,50],[0.88,40],[0.82,30],[0.74,20],[0.63,10]]
      },
      female: {
        '18-29': [[1.71,99],[1.37,90],[1.24,80],[1.14,70],[1.06,60],[0.99,50],[0.93,40],[0.86,30],[0.76,20],[0.64,10]],
        '30-39': [[1.49,99],[1.21,90],[1.10,80],[1.01,70],[0.94,60],[0.88,50],[0.82,40],[0.75,30],[0.67,20],[0.55,10]],
        '40-49': [[1.37,99],[1.10,90],[1.00,80],[0.92,70],[0.86,60],[0.80,50],[0.74,40],[0.68,30],[0.60,20],[0.50,10]],
        '50-59': [[1.22,99],[0.98,90],[0.89,80],[0.82,70],[0.76,60],[0.71,50],[0.66,40],[0.61,30],[0.54,20],[0.44,10]],
        '60+':   [[1.07,99],[0.85,90],[0.77,80],[0.71,70],[0.66,60],[0.61,50],[0.57,40],[0.53,30],[0.47,20],[0.38,10]]
      }
    },
    relativeToWeight: true
  },
  deadlift_1rm: {
    label: 'Deadlift', unit: 'lbs', higherBetter: true,
    hint: 'Load a weight you can pull 3-10 times. Go to failure — we estimate your max from that.',
    norms: {
      male: {
        '18-29': [[2.96,99],[2.35,90],[2.11,80],[1.95,70],[1.83,60],[1.74,50],[1.64,40],[1.53,30],[1.41,20],[1.19,10]],
        '30-39': [[2.63,99],[2.09,90],[1.90,80],[1.76,70],[1.66,60],[1.58,50],[1.49,40],[1.40,30],[1.29,20],[1.09,10]],
        '40-49': [[2.33,99],[1.88,90],[1.72,80],[1.60,70],[1.51,60],[1.44,50],[1.36,40],[1.27,30],[1.17,20],[0.99,10]],
        '50-59': [[2.08,99],[1.69,90],[1.55,80],[1.44,70],[1.36,60],[1.29,50],[1.22,40],[1.14,30],[1.05,20],[0.88,10]],
        '60+':   [[1.83,99],[1.49,90],[1.37,80],[1.27,70],[1.19,60],[1.13,50],[1.06,40],[0.99,30],[0.91,20],[0.76,10]]
      },
      female: {
        '18-29': [[2.05,99],[1.63,90],[1.48,80],[1.37,70],[1.28,60],[1.21,50],[1.14,40],[1.06,30],[0.96,20],[0.81,10]],
        '30-39': [[1.83,99],[1.47,90],[1.34,80],[1.24,70],[1.16,60],[1.10,50],[1.03,40],[0.96,30],[0.87,20],[0.73,10]],
        '40-49': [[1.66,99],[1.34,90],[1.22,80],[1.13,70],[1.06,60],[1.00,50],[0.94,40],[0.88,30],[0.79,20],[0.67,10]],
        '50-59': [[1.48,99],[1.20,90],[1.09,80],[1.01,70],[0.95,60],[0.90,50],[0.84,40],[0.79,30],[0.71,20],[0.59,10]],
        '60+':   [[1.28,99],[1.04,90],[0.94,80],[0.87,70],[0.82,60],[0.77,50],[0.72,40],[0.67,30],[0.61,20],[0.51,10]]
      }
    },
    relativeToWeight: true
  },
  mile_time: {
    label: 'Mile Time', unit: 'min', higherBetter: false,
    hint: 'Run 1 mile at maximum effort on a track or flat surface.',
    norms: {
      male: {
        '18-29': [[5.5,99],[6.2,90],[6.8,80],[7.4,70],[8.0,60],[8.8,50],[9.6,40],[10.5,30],[12.0,20],[14.0,10]],
        '30-39': [[5.8,99],[6.6,90],[7.2,80],[7.9,70],[8.5,60],[9.3,50],[10.2,40],[11.2,30],[12.8,20],[15.0,10]],
        '40-49': [[6.2,99],[7.0,90],[7.7,80],[8.4,70],[9.1,60],[9.9,50],[10.9,40],[12.0,30],[13.7,20],[16.0,10]],
        '50-59': [[6.8,99],[7.7,90],[8.4,80],[9.2,70],[10.0,60],[10.9,50],[12.0,40],[13.2,30],[15.1,20],[17.5,10]],
        '60+':   [[7.5,99],[8.5,90],[9.3,80],[10.2,70],[11.1,60],[12.1,50],[13.3,40],[14.6,30],[16.7,20],[19.5,10]]
      },
      female: {
        '18-29': [[6.5,99],[7.5,90],[8.2,80],[9.0,70],[9.8,60],[10.8,50],[11.8,40],[13.0,30],[14.8,20],[17.0,10]],
        '30-39': [[6.9,99],[7.9,90],[8.7,80],[9.5,70],[10.4,60],[11.4,50],[12.5,40],[13.8,30],[15.7,20],[18.0,10]],
        '40-49': [[7.5,99],[8.5,90],[9.4,80],[10.3,70],[11.2,60],[12.3,50],[13.5,40],[14.9,30],[17.0,20],[19.5,10]],
        '50-59': [[8.2,99],[9.3,90],[10.3,80],[11.3,70],[12.3,60],[13.5,50],[14.8,40],[16.3,30],[18.6,20],[21.4,10]],
        '60+':   [[9.2,99],[10.4,90],[11.5,80],[12.6,70],[13.8,60],[15.2,50],[16.7,40],[18.4,30],[21.0,20],[24.2,10]]
      }
    }
  },
  vo2max: {
    label: 'VO2 Max', unit: 'ml/kg/min', higherBetter: true,
    hint: 'Use the calculator below to estimate from an at-home test, or enter a value from Apple Watch, Garmin, or a lab test.',
    norms: {
      male: {
        '18-29': [[60,99],[52,90],[48,80],[45,70],[43,60],[41,50],[39,40],[37,30],[34,20],[29,10]],
        '30-39': [[57,99],[50,90],[46,80],[43,70],[41,60],[39,50],[37,40],[35,30],[32,20],[28,10]],
        '40-49': [[53,99],[46,90],[42,80],[40,70],[38,60],[36,50],[34,40],[32,30],[30,20],[26,10]],
        '50-59': [[49,99],[43,90],[39,80],[36,70],[34,60],[33,50],[31,40],[29,30],[27,20],[23,10]],
        '60+':   [[45,99],[39,90],[35,80],[32,70],[31,60],[29,50],[28,40],[26,30],[24,20],[20,10]]
      },
      female: {
        '18-29': [[54,99],[47,90],[43,80],[40,70],[38,60],[36,50],[34,40],[31,30],[28,20],[24,10]],
        '30-39': [[51,99],[44,90],[40,80],[37,70],[35,60],[33,50],[31,40],[29,30],[26,20],[22,10]],
        '40-49': [[47,99],[40,90],[36,80],[34,70],[32,60],[30,50],[28,40],[26,30],[24,20],[20,10]],
        '50-59': [[42,99],[36,90],[32,80],[30,70],[28,60],[27,50],[25,40],[23,30],[21,20],[17,10]],
        '60+':   [[38,99],[33,90],[29,80],[27,70],[25,60],[24,50],[22,40],[21,30],[19,20],[15,10]]
      }
    }
  },
  sit_reach: {
    label: 'Sit & Reach', unit: 'cm', higherBetter: true,
    hint: 'Sit on floor, legs straight. Reach forward as far as possible. Measure from feet (positive = past feet).',
    norms: {
      male: {
        '18-29': [[40,99],[34,90],[30,80],[27,70],[24,60],[21,50],[18,40],[15,30],[11,20],[5,10]],
        '30-39': [[38,99],[32,90],[28,80],[25,70],[22,60],[19,50],[16,40],[12,30],[8,20],[3,10]],
        '40-49': [[35,99],[29,90],[25,80],[22,70],[19,60],[16,50],[13,40],[9,30],[5,20],[0,10]],
        '50-59': [[33,99],[27,90],[23,80],[19,70],[16,60],[13,50],[10,40],[6,30],[2,20],[-3,10]],
        '60+':   [[30,99],[24,90],[20,80],[16,70],[13,60],[10,50],[7,40],[3,30],[-1,20],[-6,10]]
      },
      female: {
        '18-29': [[45,99],[39,90],[35,80],[32,70],[29,60],[26,50],[23,40],[20,30],[15,20],[10,10]],
        '30-39': [[43,99],[37,90],[33,80],[30,70],[27,60],[24,50],[21,40],[18,30],[13,20],[8,10]],
        '40-49': [[41,99],[35,90],[31,80],[28,70],[25,60],[22,50],[19,40],[16,30],[11,20],[6,10]],
        '50-59': [[38,99],[32,90],[28,80],[25,70],[22,60],[19,50],[16,40],[13,30],[8,20],[3,10]],
        '60+':   [[35,99],[29,90],[25,80],[22,70],[19,60],[16,50],[13,40],[10,30],[5,20],[0,10]]
      }
    }
  },
  shoulder_mobility: {
    label: 'Shoulder Mobility', unit: 'cm', higherBetter: true,
    hint: 'FMS screen. Reach behind back from above and below. Measure gap (negative = hands apart).',
    norms: {
      male: {
        '18-29': [[5,99],[2,90],[0,80],[-2,70],[-5,60],[-8,50],[-12,40],[-16,30],[-20,20],[-25,10]],
        '30-39': [[4,99],[1,90],[-1,80],[-4,70],[-7,60],[-10,50],[-14,40],[-18,30],[-22,20],[-27,10]],
        '40-49': [[3,99],[0,90],[-2,80],[-5,70],[-9,60],[-12,50],[-16,40],[-20,30],[-24,20],[-29,10]],
        '50-59': [[2,99],[-1,90],[-3,80],[-7,70],[-11,60],[-14,50],[-18,40],[-22,30],[-27,20],[-32,10]],
        '60+':   [[1,99],[-2,90],[-5,80],[-9,70],[-13,60],[-17,50],[-21,40],[-25,30],[-30,20],[-36,10]]
      },
      female: {
        '18-29': [[8,99],[5,90],[3,80],[0,70],[-3,60],[-6,50],[-9,40],[-13,30],[-17,20],[-22,10]],
        '30-39': [[7,99],[4,90],[2,80],[-1,70],[-4,60],[-7,50],[-11,40],[-15,30],[-19,20],[-24,10]],
        '40-49': [[6,99],[3,90],[1,80],[-2,70],[-6,60],[-9,50],[-13,40],[-17,30],[-21,20],[-26,10]],
        '50-59': [[5,99],[2,90],[-1,80],[-4,70],[-8,60],[-11,50],[-15,40],[-19,30],[-23,20],[-28,10]],
        '60+':   [[4,99],[1,90],[-2,80],[-6,70],[-10,60],[-14,50],[-18,40],[-22,30],[-27,20],[-33,10]]
      }
    }
  },
  pushup: {
    label: 'Push-up Test', unit: 'reps', higherBetter: true,
    hint: 'Max push-ups to failure with good form. No rest at the top.',
    amrap: false,
    norms: {
      male: {
        '18-29': [[56,99],[47,90],[41,80],[36,70],[32,60],[29,50],[25,40],[21,30],[16,20],[10,10]],
        '30-39': [[47,99],[39,90],[34,80],[30,70],[27,60],[24,50],[21,40],[17,30],[13,20],[8,10]],
        '40-49': [[38,99],[31,90],[27,80],[23,70],[20,60],[18,50],[16,40],[13,30],[9,20],[5,10]],
        '50-59': [[30,99],[25,90],[21,80],[18,70],[15,60],[13,50],[11,40],[9,30],[6,20],[3,10]],
        '60+':   [[24,99],[19,90],[16,80],[13,70],[11,60],[10,50],[8,40],[6,30],[4,20],[2,10]]
      },
      female: {
        '18-29': [[35,99],[30,90],[26,80],[23,70],[20,60],[17,50],[14,40],[11,30],[8,20],[4,10]],
        '30-39': [[29,99],[24,90],[21,80],[18,70],[15,60],[13,50],[10,40],[8,30],[5,20],[2,10]],
        '40-49': [[24,99],[19,90],[16,80],[13,70],[11,60],[9,50],[7,40],[5,30],[3,20],[1,10]],
        '50-59': [[20,99],[15,90],[13,80],[10,70],[8,60],[7,50],[5,40],[3,30],[2,20],[1,10]],
        '60+':   [[17,99],[12,90],[10,80],[8,70],[6,60],[5,50],[3,40],[2,30],[1,20],[0,10]]
      }
    }
  },
  pullup: {
    label: 'Pull-up Test', unit: 'reps', higherBetter: true,
    hint: 'Dead hang, chin over bar. Max reps to failure. Use bodyweight only.',
    amrap: false,
    norms: {
      male: {
        '18-29': [[22,99],[16,90],[13,80],[11,70],[9,60],[8,50],[6,40],[4,30],[2,20],[1,10]],
        '30-39': [[20,99],[14,90],[11,80],[9,70],[8,60],[6,50],[5,40],[3,30],[2,20],[1,10]],
        '40-49': [[16,99],[11,90],[9,80],[7,70],[6,60],[5,50],[4,40],[2,30],[1,20],[0,10]],
        '50-59': [[12,99],[8,90],[6,80],[5,70],[4,60],[3,50],[2,40],[1,30],[0,20],[0,10]],
        '60+':   [[8,99],[5,90],[4,80],[3,70],[2,60],[2,50],[1,40],[0,30],[0,20],[0,10]]
      },
      female: {
        '18-29': [[9,99],[6,90],[5,80],[4,70],[3,60],[2,50],[1,40],[1,30],[0,20],[0,10]],
        '30-39': [[7,99],[5,90],[4,80],[3,70],[2,60],[2,50],[1,40],[0,30],[0,20],[0,10]],
        '40-49': [[6,99],[4,90],[3,80],[2,70],[2,60],[1,50],[1,40],[0,30],[0,20],[0,10]],
        '50-59': [[4,99],[3,90],[2,80],[1,70],[1,60],[1,50],[0,40],[0,30],[0,20],[0,10]],
        '60+':   [[3,99],[2,90],[1,80],[1,70],[0,60],[0,50],[0,40],[0,30],[0,20],[0,10]]
      }
    }
  },
  grip_strength: {
    label: 'Grip Strength', unit: 'kg', higherBetter: true,
    hint: 'Dominant hand, using a hand dynamometer. Squeeze maximally for 3 seconds. Best of 3 attempts.',
    norms: {
      male: {
        '18-29': [[65,99],[57,90],[52,80],[48,70],[45,60],[43,50],[40,40],[37,30],[33,20],[28,10]],
        '30-39': [[63,99],[56,90],[51,80],[47,70],[44,60],[42,50],[39,40],[36,30],[32,20],[27,10]],
        '40-49': [[59,99],[52,90],[47,80],[44,70],[41,60],[39,50],[36,40],[33,30],[29,20],[24,10]],
        '50-59': [[55,99],[48,90],[43,80],[40,70],[37,60],[35,50],[32,40],[29,30],[26,20],[21,10]],
        '60+':   [[49,99],[42,90],[38,80],[35,70],[32,60],[30,50],[28,40],[25,30],[22,20],[17,10]]
      },
      female: {
        '18-29': [[40,99],[35,90],[31,80],[28,70],[26,60],[24,50],[22,40],[20,30],[17,20],[13,10]],
        '30-39': [[39,99],[34,90],[30,80],[27,70],[25,60],[23,50],[21,40],[19,30],[16,20],[12,10]],
        '40-49': [[36,99],[31,90],[28,80],[25,70],[23,60],[21,50],[19,40],[17,30],[14,20],[11,10]],
        '50-59': [[33,99],[28,90],[25,80],[22,70],[20,60],[19,50],[17,40],[15,30],[13,20],[9,10]],
        '60+':   [[29,99],[25,90],[22,80],[19,70],[17,60],[16,50],[14,40],[12,30],[10,20],[7,10]]
      }
    }
  },
  chair_stand: {
    label: '30-sec Chair Stand', unit: 'reps', higherBetter: true,
    hint: 'Sit in a chair, arms crossed. Stand fully then sit. Count reps in 30 seconds.',
    norms: {
      male: {
        '18-29': [[25,99],[22,90],[20,80],[18,70],[17,60],[16,50],[14,40],[13,30],[11,20],[9,10]],
        '30-39': [[24,99],[21,90],[19,80],[17,70],[16,60],[15,50],[13,40],[12,30],[10,20],[8,10]],
        '40-49': [[22,99],[19,90],[17,80],[16,70],[14,60],[13,50],[12,40],[10,30],[9,20],[7,10]],
        '50-59': [[19,99],[17,90],[15,80],[14,70],[12,60],[12,50],[10,40],[9,30],[7,20],[5,10]],
        '60+':   [[17,99],[15,90],[14,80],[12,70],[11,60],[10,50],[9,40],[7,30],[6,20],[4,10]]
      },
      female: {
        '18-29': [[23,99],[20,90],[18,80],[17,70],[15,60],[14,50],[13,40],[11,30],[10,20],[8,10]],
        '30-39': [[22,99],[19,90],[17,80],[16,70],[14,60],[13,50],[12,40],[10,30],[9,20],[7,10]],
        '40-49': [[20,99],[18,90],[16,80],[14,70],[13,60],[12,50],[11,40],[9,30],[8,20],[6,10]],
        '50-59': [[18,99],[16,90],[14,80],[13,70],[11,60],[11,50],[9,40],[8,30],[6,20],[5,10]],
        '60+':   [[16,99],[14,90],[13,80],[11,70],[10,60],[9,50],[8,40],[6,30],[5,20],[3,10]]
      }
    }
  },
  balance: {
    label: 'Single-leg Balance', unit: 'sec', higherBetter: true,
    hint: 'Stand on one foot, eyes closed. Time until you touch down. Best of 2 attempts per leg, use better leg.',
    norms: {
      male: {
        '18-29': [[45,99],[35,90],[28,80],[22,70],[17,60],[13,50],[9,40],[6,30],[3,20],[1,10]],
        '30-39': [[40,99],[30,90],[24,80],[18,70],[14,60],[10,50],[7,40],[4,30],[2,20],[1,10]],
        '40-49': [[30,99],[22,90],[17,80],[13,70],[9,60],[7,50],[4,40],[3,30],[1,20],[0,10]],
        '50-59': [[20,99],[14,90],[10,80],[7,70],[5,60],[3,50],[2,40],[1,30],[0,20],[0,10]],
        '60+':   [[12,99],[8,90],[5,80],[3,70],[2,60],[1,50],[1,40],[0,30],[0,20],[0,10]]
      },
      female: {
        '18-29': [[43,99],[33,90],[26,80],[20,70],[15,60],[11,50],[8,40],[5,30],[2,20],[1,10]],
        '30-39': [[37,99],[28,90],[21,80],[16,70],[12,60],[8,50],[5,40],[3,30],[1,20],[0,10]],
        '40-49': [[28,99],[20,90],[15,80],[11,70],[7,60],[5,50],[3,40],[2,30],[1,20],[0,10]],
        '50-59': [[18,99],[12,90],[8,80],[5,70],[3,60],[2,50],[1,40],[0,30],[0,20],[0,10]],
        '60+':   [[10,99],[6,90],[4,80],[2,70],[1,60],[1,50],[0,40],[0,30],[0,20],[0,10]]
      }
    }
  },
  walk_6min: {
    label: '6-Minute Walk', unit: 'm', higherBetter: true,
    hint: 'Walk as far as possible in 6 minutes on a flat surface. Measure distance in metres.',
    norms: {
      male: {
        '18-29': [[780,99],[720,90],[685,80],[655,70],[630,60],[608,50],[583,40],[554,30],[516,20],[460,10]],
        '30-39': [[760,99],[700,90],[665,80],[635,70],[610,60],[588,50],[563,40],[534,30],[496,20],[440,10]],
        '40-49': [[730,99],[670,90],[635,80],[605,70],[580,60],[558,50],[533,40],[504,30],[466,20],[410,10]],
        '50-59': [[690,99],[630,90],[595,80],[565,70],[540,60],[518,50],[493,40],[464,30],[426,20],[370,10]],
        '60+':   [[630,99],[570,90],[535,80],[505,70],[480,60],[458,50],[433,40],[404,30],[366,20],[310,10]]
      },
      female: {
        '18-29': [[740,99],[680,90],[645,80],[615,70],[590,60],[568,50],[543,40],[514,30],[476,20],[420,10]],
        '30-39': [[720,99],[660,90],[625,80],[595,70],[570,60],[548,50],[523,40],[494,30],[456,20],[400,10]],
        '40-49': [[695,99],[635,90],[600,80],[570,70],[545,60],[523,50],[498,40],[469,30],[431,20],[375,10]],
        '50-59': [[655,99],[595,90],[560,80],[530,70],[505,60],[483,50],[458,40],[429,30],[391,20],[335,10]],
        '60+':   [[595,99],[535,90],[500,80],[470,70],[445,60],[423,50],[398,40],[369,30],[331,20],[275,10]]
      }
    }
  }
};

var FITNESS_CATEGORIES = [
  { key: 'strength',   label: 'Strength',   tests: ['bench_1rm','squat_1rm','deadlift_1rm','pushup','pullup'] },
  { key: 'cardio',     label: 'Cardio',     tests: ['mile_time','vo2max','walk_6min'] },
  { key: 'functional', label: 'Functional', tests: ['grip_strength','chair_stand','balance'] },
  { key: 'mobility',   label: 'Mobility',   tests: ['sit_reach','shoulder_mobility'] }
];

// Recommendation engine — returns ordered list of test keys for this user
function getRecommendedTests(profile, byKey) {
  var age = profile.age;
  var goal = ((window.userProfileData || {}).primary_goal || '').toLowerCase();
  var scored = [];

  Object.keys(FITNESS_NORMS).forEach(function(key) {
    var score = 0;
    var history = byKey[key] || [];
    var latest = history[0];
    var daysSince = latest ? (Date.now() - new Date(latest.tested_at)) / 86400000 : 999;

    // Staleness — not tested in 60+ days gets priority
    if (daysSince > 90) score += 30;
    else if (daysSince > 60) score += 15;
    else if (daysSince < 14) score -= 20; // recently done, deprioritise

    // Never tested
    if (!latest) score += 25;

    // Age suitability
    if (age >= 60) {
      if (['chair_stand','balance','walk_6min','grip_strength','sit_reach'].includes(key)) score += 30;
      if (['bench_1rm','squat_1rm','deadlift_1rm'].includes(key)) score -= 15;
    } else if (age >= 50) {
      if (['chair_stand','balance','grip_strength','walk_6min'].includes(key)) score += 20;
      if (['bench_1rm','squat_1rm','deadlift_1rm'].includes(key)) score -= 5;
    } else if (age < 35) {
      if (['bench_1rm','squat_1rm','deadlift_1rm','pullup','vo2max'].includes(key)) score += 15;
    }

    // Goal alignment
    if (goal.includes('weight') || goal.includes('fat')) {
      if (['walk_6min','mile_time','vo2max','chair_stand'].includes(key)) score += 20;
    }
    if (goal.includes('muscle') || goal.includes('strength')) {
      if (['bench_1rm','squat_1rm','deadlift_1rm','pushup','pullup','grip_strength'].includes(key)) score += 20;
    }
    if (goal.includes('longevity') || goal.includes('health')) {
      if (['grip_strength','balance','vo2max','chair_stand','sit_reach'].includes(key)) score += 20;
    }

    // Low percentile = needs attention
    if (latest && latest.percentile && latest.percentile < 30) score += 20;

    scored.push({ key: key, score: score });
  });

  return scored.sort(function(a,b){ return b.score - a.score; }).slice(0,4).map(function(x){ return x.key; });
}

function getUserProfile() {
  var p = window.userProfileData || {};
  var age = 35;
  var dobStr = p.birth_date || p.dob;
  if (dobStr) { var d = new Date(dobStr); if (!isNaN(d)) age = Math.floor((Date.now()-d)/(365.25*24*3600*1000)); }
  var sex = (p.gender || p.sex || 'male').toLowerCase().includes('f') ? 'female' : 'male';
  var weightKg = p.current_weight_kg || 80;
  var weightLbs = weightKg * 2.205;
  return { age: age, sex: sex, weightLbs: weightLbs };
}

function getAgeGroup(age) {
  if (age < 30) return '18-29';
  if (age < 40) return '30-39';
  if (age < 50) return '40-49';
  if (age < 60) return '50-59';
  return '60+';
}

function calcPercentile(testKey, rawValue, profile) {
  var norm = FITNESS_NORMS[testKey];
  if (!norm) return null;
  var ag = getAgeGroup(profile.age);
  var table = norm.norms[profile.sex][ag];
  var val = norm.relativeToWeight ? rawValue / profile.weightLbs : rawValue;
  if (norm.higherBetter) {
    for (var i = 0; i < table.length; i++) {
      if (val >= table[i][0]) return table[i][1];
    }
    return 1;
  } else {
    for (var i = 0; i < table.length; i++) {
      if (val <= table[i][0]) return table[i][1];
    }
    return 1;
  }
}

function percentileLabel(p) {
  if (p >= 90) return { text: 'Elite', cls: 'pct-elite' };
  if (p >= 70) return { text: 'Good', cls: 'pct-good' };
  if (p >= 40) return { text: 'Average', cls: 'pct-avg' };
  if (p >= 20) return { text: 'Below avg', cls: 'pct-low' };
  return { text: 'Poor', cls: 'pct-poor' };
}

var AMRAP_TESTS = ['bench_1rm','squat_1rm','deadlift_1rm'];
var REPS_ONLY_TESTS = ['pushup','pullup'];

function epley1RM(weight, reps) {
  // Epley formula: 1RM = weight × (1 + reps/30)
  return Math.round(weight * (1 + reps / 30));
}

function selectVO2Method(method) {
  var rockport = document.getElementById('vo2-rockport');
  var cooper = document.getElementById('vo2-cooper');
  var btnR = document.getElementById('vo2-pick-rockport');
  var btnC = document.getElementById('vo2-pick-cooper');
  if (method === 'cooper') {
    rockport.style.display = 'none';
    cooper.style.display = 'block';
    btnR.style.background = 'transparent';
    btnR.style.borderColor = 'var(--gold-border)';
    btnC.style.background = 'var(--gold-faint)';
    btnC.style.borderColor = 'var(--gold)';
  } else {
    rockport.style.display = 'block';
    cooper.style.display = 'none';
    btnR.style.background = 'var(--gold-faint)';
    btnR.style.borderColor = 'var(--gold)';
    btnC.style.background = 'transparent';
    btnC.style.borderColor = 'var(--gold-border)';
  }
}

function calcVO2() {
  var w = parseFloat(document.getElementById('vo2-weight').value);
  var age = parseFloat(document.getElementById('vo2-age').value);
  var sex = parseFloat(document.getElementById('vo2-sex').value);
  var time = parseFloat(document.getElementById('vo2-time').value);
  var hr = parseFloat(document.getElementById('vo2-hr').value);
  var result = document.getElementById('vo2-result');
  if (!w || !age || !time || !hr) { result.textContent = ''; return; }
  var vo2 = 132.853 - (0.0769 * w) - (0.3877 * age) + (6.315 * sex) - (3.2649 * time) - (0.1565 * hr);
  vo2 = Math.round(vo2 * 10) / 10;
  if (vo2 > 0) {
    result.textContent = 'Estimated VO2 Max: ' + vo2 + ' ml/kg/min';
    document.getElementById('ft-value').value = vo2;
  } else {
    result.textContent = 'Check your values — result seems too low.';
  }
}

function calcVO2Cooper() {
  var dist = parseFloat(document.getElementById('vo2-cooper-dist').value);
  var unit = document.getElementById('vo2-cooper-unit').value;
  var result = document.getElementById('vo2-cooper-result');
  if (!dist || dist <= 0) { result.textContent = ''; return; }
  var metres = unit === 'miles' ? dist * 1609.34 : dist;
  var vo2 = (metres - 504.9) / 44.73;
  vo2 = Math.round(vo2 * 10) / 10;
  if (vo2 > 0) {
    result.textContent = 'Estimated VO2 Max: ' + vo2 + ' ml/kg/min';
    document.getElementById('ft-value').value = vo2;
  } else {
    result.textContent = 'Check your values — result seems too low.';
  }
}

function onFitnessTestChange() {
  var key = document.getElementById('ft-test').value;
  var norm = FITNESS_NORMS[key];
  var isMileTime = key === 'mile_time';
  var isAMRAP = AMRAP_TESTS.includes(key);
  var isRepsOnly = REPS_ONLY_TESTS.includes(key);
  var isVO2 = key === 'vo2max';

  document.getElementById('ft-time-fields').style.display = isMileTime ? 'block' : 'none';
  document.getElementById('ft-amrap-fields').style.display = (isAMRAP || isRepsOnly) ? 'block' : 'none';
  document.getElementById('ft-value-row').style.display = (!isMileTime && !isAMRAP && !isRepsOnly) ? 'flex' : 'none';
  var vo2Calc = document.getElementById('vo2-calculator');
  if (vo2Calc) vo2Calc.style.display = isVO2 ? 'block' : 'none';

  // Configure AMRAP fields for reps-only (bodyweight) tests
  var amrapLabel = document.getElementById('ft-amrap-label');
  if (isRepsOnly) {
    amrapLabel.textContent = 'Added weight (optional) & reps to failure';
    document.getElementById('ft-amrap-weight').placeholder = '0';
    document.getElementById('ft-amrap-weight').required = false;
    document.getElementById('ft-amrap-wunit').textContent = 'lbs added (0 = bodyweight)';
    document.getElementById('ft-amrap-reps').placeholder = 'reps';
    document.getElementById('ft-amrap-1rm-preview').textContent = '';
  } else if (isAMRAP) {
    amrapLabel.textContent = 'Weight used & reps completed to failure';
    document.getElementById('ft-amrap-weight').placeholder = 'e.g. 185';
    document.getElementById('ft-amrap-weight').required = true;
    document.getElementById('ft-amrap-wunit').textContent = 'lbs';
  }

  if (norm) {
    document.getElementById('ft-val-label').textContent = norm.label;
    document.getElementById('ft-unit-display').textContent = norm.unit;
    var sub = document.getElementById('ft-modal-sub');
    if (isAMRAP) sub.textContent = 'Use a weight you can lift for 3-10 reps and go to failure. We calculate your estimated 1RM automatically.';
    else if (isRepsOnly) sub.textContent = 'Max reps to failure with good form. Add weight if using a belt or vest.';
    else sub.textContent = norm.hint || 'Record a benchmark result. Be consistent — same time of day, rested state.';
  }

  // Live 1RM preview for AMRAP tests
  if (isAMRAP) {
    ['ft-amrap-weight','ft-amrap-reps'].forEach(function(id) {
      document.getElementById(id).oninput = function() {
        var w = parseFloat(document.getElementById('ft-amrap-weight').value);
        var r = parseInt(document.getElementById('ft-amrap-reps').value);
        var preview = document.getElementById('ft-amrap-1rm-preview');
        if (w > 0 && r > 0 && r <= 30) {
          preview.textContent = 'Estimated 1RM: ' + epley1RM(w, r) + ' ' + document.getElementById('ft-amrap-unit').value;
        } else {
          preview.textContent = '';
        }
      };
    });
  }
}

function openLogTestModal(preselect) {
  document.getElementById('ft-date').value = localDateStr(new Date());
  document.getElementById('ft-value').value = '';
  document.getElementById('ft-mins').value = '';
  document.getElementById('ft-secs').value = '';
  document.getElementById('ft-amrap-weight').value = '';
  document.getElementById('ft-amrap-reps').value = '';
  document.getElementById('ft-amrap-1rm-preview').textContent = '';
  document.getElementById('ft-notes').value = '';
  // Reset VO2 calculators
  document.getElementById('vo2-result').textContent = '';
  document.getElementById('vo2-time').value = '';
  document.getElementById('vo2-hr').value = '';
  document.getElementById('vo2-cooper-dist').value = '';
  document.getElementById('vo2-cooper-result').textContent = '';
  selectVO2Method('rockport');
  // Pre-fill VO2 calculator from profile
  var p = window.userProfileData || {};
  if (p.current_weight_kg) document.getElementById('vo2-weight').value = Math.round(p.current_weight_kg * 2.205);
  var dobStr = p.birth_date || p.dob;
  if (dobStr) {
    var dob = new Date(dobStr);
    if (!isNaN(dob)) document.getElementById('vo2-age').value = Math.floor((new Date() - dob) / (365.25 * 24 * 3600 * 1000));
  }
  if (p.sex === 'female') document.getElementById('vo2-sex').value = '0';
  else document.getElementById('vo2-sex').value = '1';
  if (preselect) document.getElementById('ft-test').value = preselect;
  onFitnessTestChange();
  openModal('fitness-modal');
}

async function saveFitnessTest() {
  var key = document.getElementById('ft-test').value;
  var norm = FITNESS_NORMS[key];
  var date = document.getElementById('ft-date').value;
  var notes = document.getElementById('ft-notes').value.trim();
  var rawValue;

  if (key === 'mile_time') {
    var mins = parseFloat(document.getElementById('ft-mins').value) || 0;
    var secs = parseFloat(document.getElementById('ft-secs').value) || 0;
    rawValue = mins + secs / 60;
    if (rawValue <= 0) { alert('Enter a mile time.'); return; }
  } else if (AMRAP_TESTS.includes(key)) {
    var w = parseFloat(document.getElementById('ft-amrap-weight').value);
    var r = parseInt(document.getElementById('ft-amrap-reps').value);
    if (!w || !r || r > 30) { alert('Enter weight and reps (max 30 for accuracy).'); return; }
    rawValue = epley1RM(w, r);
  } else if (REPS_ONLY_TESTS.includes(key)) {
    var r = parseInt(document.getElementById('ft-amrap-reps').value);
    if (!r || r <= 0) { alert('Enter reps completed.'); return; }
    rawValue = r;
  } else {
    rawValue = parseFloat(document.getElementById('ft-value').value);
    if (isNaN(rawValue)) { alert('Enter a value.'); return; }
  }

  var profile = getUserProfile();
  var percentile = calcPercentile(key, rawValue, profile);

  var payload = {
    user_id: currentUser.id,
    test_key: key,
    raw_value: rawValue,
    unit: norm.unit,
    percentile: percentile,
    notes: notes,
    tested_at: date + 'T12:00:00',
    created_at: new Date().toISOString()
  };

  try {
    var btn = document.querySelector('#fitness-modal .modal-btn-primary');
    btn.textContent = 'Saving…'; btn.disabled = true;
    await supabaseRequest('/rest/v1/fitness_tests', 'POST', payload, currentSession.access_token);
    closeModal('fitness-modal');
    renderStrengthPage();
  } catch(e) {
    console.error(e);
    alert('Could not save. Create the fitness_tests table in Supabase:\n\nCREATE TABLE fitness_tests (\n  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,\n  user_id uuid REFERENCES auth.users(id),\n  test_key text,\n  raw_value numeric,\n  unit text,\n  percentile integer,\n  notes text,\n  tested_at timestamptz,\n  created_at timestamptz DEFAULT now()\n);\n\nALTER TABLE fitness_tests ENABLE ROW LEVEL SECURITY;\nCREATE POLICY "own" ON fitness_tests FOR ALL USING (auth.uid() = user_id);');
  } finally {
    var b = document.querySelector('#fitness-modal .modal-btn-primary');
    if (b) { b.textContent = 'Save Result'; b.disabled = false; }
  }
}

async function renderStrengthPage() {
  if (!currentUser) return;
  var container = document.getElementById('fitness-categories');
  if (!container) return;
  container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:24px 0">Loading…</div>';

  try {
    var tests = await supabaseRequest(
      '/rest/v1/fitness_tests?user_id=eq.' + currentUser.id + '&order=tested_at.desc&limit=200',
      'GET', null, currentSession.access_token
    );
    if (!tests || tests.error) tests = [];

    // Group by test_key, most recent first
    var byKey = {};
    tests.forEach(function(t) {
      if (!byKey[t.test_key]) byKey[t.test_key] = [];
      byKey[t.test_key].push(t);
    });

    var profile = getUserProfile();
    var html = '';

    var recommended = getRecommendedTests(profile, byKey);

    FITNESS_CATEGORIES.forEach(function(cat) {
      var hasAny = cat.tests.some(function(k) { return byKey[k] && byKey[k].length > 0; });
      html += '<div style="margin-bottom:28px">'
        + '<div style="font-size:9px;letter-spacing:.25em;text-transform:uppercase;color:var(--gold);margin-bottom:12px">' + cat.label + '</div>'
        + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">';

      cat.tests.forEach(function(key) {
        var norm = FITNESS_NORMS[key];
        var history = byKey[key] || [];
        var latest = history[0];

        var valueDisplay = '—';
        var percentileDisplay = '';
        var pctClass = '';
        var historyBars = '';

        if (latest) {
          if (key === 'mile_time') {
            var totalMins = latest.raw_value;
            var m = Math.floor(totalMins);
            var s = Math.round((totalMins - m) * 60);
            valueDisplay = m + ':' + (s < 10 ? '0' : '') + s;
          } else {
            valueDisplay = latest.raw_value % 1 === 0 ? latest.raw_value : parseFloat(latest.raw_value).toFixed(1);
          }
          var p = latest.percentile || calcPercentile(key, parseFloat(latest.raw_value), profile);
          var pl = percentileLabel(p);
          percentileDisplay = p + 'th percentile';
          pctClass = pl.cls;

          // Sparkline from history (last 6)
          var spark = history.slice(0,6).reverse();
          var vals = spark.map(function(t) { return parseFloat(t.raw_value); });
          var minV = Math.min.apply(null,vals), maxV = Math.max.apply(null,vals);
          var range = maxV - minV || 1;
          historyBars = spark.map(function(t,i) {
            var pct = ((parseFloat(t.raw_value) - minV) / range) * 70 + 15;
            if (!norm.higherBetter) pct = 100 - pct;
            var isLatest = i === spark.length - 1;
            return '<div style="flex:1;background:' + (isLatest?'var(--gold)':'rgba(184,151,90,.3)') + ';height:' + Math.round(pct) + '%;min-height:3px;border-radius:1px"></div>';
          }).join('');
        }

        var dateStr = latest ? new Date(latest.tested_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';

        var isRec = recommended.indexOf(key) !== -1;
        html += '<div class="card" style="padding:20px;position:relative' + (isRec ? ';border-color:rgba(184,151,90,.5)' : '') + '">'
          + (isRec ? '<div style="position:absolute;top:12px;right:12px;font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);background:rgba(184,151,90,.12);border:1px solid var(--gold-border);padding:2px 8px">Recommended</div>' : '')
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">'
          + '<div>'
          + '<div style="font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">' + norm.label + '</div>'
          + '<div style="display:flex;align-items:baseline;gap:6px">'
          + '<div style="font-family:var(--F);font-size:36px;font-weight:300;line-height:1">' + valueDisplay + '</div>'
          + (latest ? '<div style="font-size:12px;color:var(--muted)">' + norm.unit + '</div>' : '')
          + '</div>'
          + (percentileDisplay ? '<div class="pct-badge ' + pctClass + '" style="margin-top:6px">' + percentileDisplay + '</div>' : '')
          + (dateStr ? '<div style="font-size:10px;color:var(--muted);margin-top:4px">' + dateStr + '</div>' : '')
          + '</div>'
          + '<div style="display:flex;align-items:flex-end;gap:3px;height:48px;width:60px">' + historyBars + '</div>'
          + '</div>'
          + '<div style="font-size:11px;color:var(--muted);line-height:1.5;border-top:1px solid var(--gold-border);padding-top:10px;display:flex;justify-content:space-between;align-items:center">'
          + '<span>' + norm.hint + '</span>'
          + '<span class="log-test-btn" data-key="' + key + '" style="cursor:pointer;color:var(--gold);white-space:nowrap;margin-left:12px">+ Log</span>'
          + '</div>'
          + '</div>';
      });

      html += '</div></div>';
    });

    container.innerHTML = html;

    // Delegated listener for log buttons
    container.addEventListener('click', function(e) {
      var logBtn = e.target.closest('.log-test-btn');
      if (logBtn) { openLogTestModal(logBtn.getAttribute('data-key')); }
    });

  } catch(e) {
    console.error('Fitness page error:', e);
    var c = document.getElementById('fitness-categories');
    if (c) c.innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-state-icon">🏋️</div><div class="empty-state-text">No tests logged yet.<br>Hit "+ Log a Test" to start.</div></div>';
  }
}

// ── DID YOU KNOW ── 
var insightLibrary = {
  longevity: [
    {
      icon: '🧬',
      hook: 'Normal bloodwork ranges are not the same as optimal ranges.',
      body: 'Lab reference ranges are built from population averages — including sick people. A result flagged as "normal" can still be far from the level associated with long-term health. Optimal ranges for longevity are often much narrower.',
      tag: 'Bloodwork'
    },
    {
      icon: '🔥',
      hook: 'Chronic low-grade inflammation is the underlying driver of most age-related disease.',
      body: 'Conditions like heart disease, Alzheimers, and type 2 diabetes all share a common thread — inflammation that builds silently over years. Markers like hsCRP and homocysteine can detect this long before symptoms appear.',
      tag: 'Longevity'
    },
    {
      icon: '💧',
      hook: 'Reverse osmosis water removes the minerals your body needs most.',
      body: 'RO filtration removes fluoride and contaminants but also strips magnesium, calcium, and potassium. If you drink RO water exclusively, you may be quietly depleting minerals critical for heart rhythm, sleep quality, and muscle function.',
      tag: 'Hydration'
    },
    {
      icon: '🫀',
      hook: 'Your resting heart rate trend matters more than any single reading.',
      body: 'A one-off resting HR means little. But a resting HR that has been climbing over weeks is an early signal of accumulated stress, illness, or overtraining — often before you feel it.',
      tag: 'Cardiovascular'
    }
  ],
  energy: [
    {
      icon: '😴',
      hook: 'Sleep debt is real — and you cannot fully pay it back on weekends.',
      body: 'Research shows that recovering from accumulated sleep deprivation takes far longer than the lost sleep itself. Consistent 6-hour nights create cognitive and metabolic deficits that a weekend lie-in will not fix.',
      tag: 'Sleep'
    },
    {
      icon: '⚡',
      hook: 'Iron deficiency can cause exhaustion long before anaemia shows up on a blood test.',
      body: 'Ferritin — your iron storage protein — can be depleted for months before haemoglobin drops enough to be flagged. Low ferritin alone causes fatigue, brain fog, and poor exercise recovery, even with a "normal" iron panel.',
      tag: 'Nutrition'
    },
    {
      icon: '🍬',
      hook: 'Energy crashes after meals are a sign of glucose instability, not just sugar intake.',
      body: 'Post-meal fatigue is often driven by a rapid glucose spike followed by a crash — triggered not just by sweets but by refined carbs, large portions, or eating carbs in isolation. Pairing carbs with protein or fat dramatically smooths this curve.',
      tag: 'Nutrition'
    },
    {
      icon: '☕',
      hook: 'Caffeine does not create energy — it masks the signal that tells you you are tired.',
      body: 'Caffeine works by blocking adenosine receptors, not by generating energy. The adenosine keeps building while you feel alert, then crashes when the caffeine clears — which is why the 3pm slump hits harder when you have had a lot of coffee.',
      tag: 'Hydration'
    }
  ],
  sleep: [
    {
      icon: '🍷',
      hook: 'Alcohol makes you fall asleep faster but destroys your sleep quality.',
      body: 'Even moderate alcohol suppresses REM sleep — the stage responsible for memory consolidation and emotional regulation. You may sleep 8 hours and wake feeling unrested — HRV is one of the clearest ways to see this effect.',
      tag: 'Sleep'
    },
    {
      icon: '🧠',
      hook: 'Your brain physically cleans itself during deep sleep.',
      body: 'The glymphatic system — essentially your brain waste disposal — is almost exclusively active during deep sleep. It flushes out metabolic waste including amyloid-beta, the protein associated with Alzheimers. Poor sleep means poor clearance.',
      tag: 'Sleep'
    },
    {
      icon: '🌡️',
      hook: 'Your body temperature needs to drop 1-2°C to initiate sleep.',
      body: 'Core body cooling is a key trigger for sleep onset. A warm shower or bath 1-2 hours before bed actually helps — the subsequent cooling accelerates the drop. Keeping your room cold (16-19°C / 60-67°F) is one of the most evidence-backed sleep improvements.',
      tag: 'Sleep'
    },
    {
      icon: '💊',
      hook: 'Magnesium deficiency is one of the most common and overlooked causes of poor sleep.',
      body: 'Magnesium activates the parasympathetic nervous system and regulates GABA — the neurotransmitter that quiets the brain for sleep. Deficiency is extremely common, partly because modern soils are depleted and RO water removes what is left.',
      tag: 'Nutrition'
    }
  ],
  fitness: [
    {
      icon: '💪',
      hook: 'Muscle is built during rest, not during training.',
      body: 'Training creates the stimulus — microscopic muscle damage that signals adaptation. The actual growth happens in the 24-72 hours after, during recovery. Insufficient sleep or back-to-back training sessions actively prevent the gains you worked for.',
      tag: 'Recovery'
    },
    {
      icon: '🥩',
      hook: 'When you eat protein matters almost as much as how much you eat.',
      body: 'Muscle protein synthesis peaks when protein is spread across meals rather than concentrated in one. Your body can only utilise roughly 20-40g per sitting for muscle building. Spreading intake across 3-4 meals is significantly more effective than one large protein meal.',
      tag: 'Nutrition'
    },
    {
      icon: '📉',
      hook: 'Overtraining looks identical to undertraining from the outside.',
      body: 'A plateau in performance, persistent fatigue, and mood changes can all be caused by doing too much, not too little. HRV declining week over week is one of the clearest early signals that your body is under more stress than it can adapt to.',
      tag: 'Recovery'
    },
    {
      icon: '🦴',
      hook: 'Strength training is the most powerful intervention for long-term metabolic health.',
      body: 'Muscle tissue is metabolically active — the more you have, the more glucose you clear from the bloodstream at rest. Higher muscle mass is strongly correlated with insulin sensitivity, lower visceral fat, and reduced all-cause mortality.',
      tag: 'Fitness'
    }
  ],
  focus: [
    {
      icon: '🐟',
      hook: 'Omega-3 deficiency is one of the most common nutritional gaps in the developed world.',
      body: 'DHA — found almost exclusively in fatty fish and algae — is a structural component of brain cell membranes. Low DHA is associated with slower cognition, mood instability, and higher inflammation. Most people get a fraction of what research suggests is optimal.',
      tag: 'Nutrition'
    },
    {
      icon: '🩸',
      hook: 'Blood glucose swings are a leading cause of brain fog and poor focus.',
      body: 'Your brain runs almost exclusively on glucose. Rapid spikes and crashes — from refined carbs, skipped meals, or high-sugar snacks — create the cognitive equivalent of flickering lights. Stable glucose means stable attention.',
      tag: 'Nutrition'
    },
    {
      icon: '💧',
      hook: 'Even mild dehydration measurably reduces cognitive performance.',
      body: 'Studies show that a 1-2% reduction in body water — before you even feel thirsty — impairs working memory, attention, and reaction time. Thirst is a lagging indicator. By the time you feel it, performance is already affected.',
      tag: 'Hydration'
    },
    {
      icon: '😴',
      hook: 'One bad night of sleep impairs cognition as much as being legally drunk.',
      body: '17-19 hours of wakefulness produces cognitive impairment equivalent to a 0.05% blood alcohol level. Yet most people in this state feel fine — the same way people underestimate their impairment when drunk.',
      tag: 'Sleep'
    }
  ],
  mood: [
    {
      icon: '🦠',
      hook: 'About 90% of your serotonin is made in your gut, not your brain.',
      body: 'The gut-brain axis means your microbiome directly influences mood, anxiety, and emotional regulation. Dietary diversity, fibre, and fermented foods feed the bacteria that produce the neurotransmitters affecting how you feel.',
      tag: 'Nutrition'
    },
    {
      icon: '☀️',
      hook: 'Vitamin D deficiency is strongly associated with depression — and most people are deficient.',
      body: 'Vitamin D acts more like a hormone than a vitamin, with receptors throughout the brain. Deficiency is linked to higher rates of depression, anxiety, and seasonal mood changes. Optimal levels (60-80 ng/mL) are well above what most labs flag as sufficient.',
      tag: 'Nutrition'
    },
    {
      icon: '🧘',
      hook: 'HRV is one of the best objective measures of your stress resilience.',
      body: 'Heart rate variability reflects the balance between your sympathetic (fight-or-flight) and parasympathetic (rest) nervous systems. A declining HRV trend — even before you feel stressed — is your body signalling that its capacity to handle load is shrinking.',
      tag: 'Recovery'
    },
    {
      icon: '🏃',
      hook: 'Exercise is as effective as antidepressants for mild to moderate depression.',
      body: 'Multiple large-scale studies show that regular aerobic exercise produces antidepressant effects comparable to medication — with the added benefits of improved sleep, cognition, and cardiovascular health. The dose that matters most is consistency, not intensity.',
      tag: 'Fitness'
    }
  ],
  weight: [
    {
      icon: '⚖️',
      hook: 'Daily weight fluctuations of 1-3kg are normal and tell you almost nothing.',
      body: 'Water retention, food volume, hormonal shifts, and glycogen storage all move the scale dramatically day to day. The only meaningful signal is the trend over 2-4 weeks — which is why logging consistently matters more than any single reading.',
      tag: 'Body Composition'
    },
    {
      icon: '🥩',
      hook: 'High protein intake is the single most evidence-backed strategy for fat loss.',
      body: 'Protein has the highest thermic effect of any macronutrient — your body burns roughly 25-30% of protein calories just digesting it. It also preserves muscle during a calorie deficit and reduces hunger more than carbs or fat.',
      tag: 'Nutrition'
    },
    {
      icon: '😴',
      hook: 'Sleep deprivation makes fat loss almost impossible.',
      body: 'Poor sleep elevates ghrelin (hunger hormone) and suppresses leptin (satiety hormone) — dramatically increasing appetite and cravings for calorie-dense food. Studies show sleep-deprived dieters lose 55% less fat and more muscle than those who sleep adequately.',
      tag: 'Sleep'
    },
    {
      icon: '💪',
      hook: 'Muscle burns more calories at rest than fat — but probably less than you think.',
      body: 'A kg of muscle burns roughly 13 kcal/day at rest vs 4.5 for fat. The metabolic advantage of muscle is real but modest — the bigger benefit is that more muscle means better glucose disposal, improved body composition, and sustainable long-term leanness.',
      tag: 'Fitness'
    }
  ]
};

// Goal key mapping from profile values
var goalKeyMap = {
  longevity: 'longevity',
  energy: 'energy',
  sleep: 'sleep',
  fitness: 'fitness',
  gain_strength: 'fitness',
  stress: 'mood',
  feel_better: 'mood',
  sleep_better: 'sleep',
  weight: 'weight',
  lose_weight: 'weight',
  healthier_diet: 'longevity',
  focus: 'focus'
};

function loadDidYouKnow() {
  if (!currentUser) return;

  // Get goal from profiles table first
  var goal = (window.userProfileData && window.userProfileData.primary_goal) || '';
  if (!goal) goal = document.getElementById('p-goal') ? document.getElementById('p-goal').value : '';

  var key = goalKeyMap[goal] || 'longevity';
  var insights = insightLibrary[key] || insightLibrary.longevity;

  // Show top 2 insights
  var toShow = insights.slice(0, 2);
  var goalLabels = {
    longevity: 'Longevity', energy: 'Energy', sleep: 'Sleep',
    fitness: 'Fitness', mood: 'Mood', weight: 'Weight management', focus: 'Focus'
  };

  document.getElementById('dyk-goal-label').textContent = goalLabels[key] || 'Your goals';
  document.getElementById('dyk-insights').innerHTML = toShow.map(function(ins) {
    return '<div class="dyk-card">'
      + '<div class="dyk-icon">' + ins.icon + '</div>'
      + '<div class="dyk-content">'
      + '<div class="dyk-hook">' + ins.hook + '</div>'
      + '<div class="dyk-body">' + ins.body + '</div>'
      + '<div class="dyk-tag">' + ins.tag + '</div>'
      + '</div></div>';
  }).join('');
}

// ── BENCHMARK DATA ──
// Benchmarks sourced from peer-reviewed population studies
// Tiers: low / below-average / average / good / optimal
var benchmarks = {
  sleep: {
    title: 'Sleep Duration',
    unit: 'h', 
    higherIsBetter: true,
    ticks: ['< 5h', '6h', '7h', '8h', '9h+'],
    tiers: [
      { name: 'Below recommended', range: 'Under 6h', max: 6, color: '#e07070' },
      { name: 'Below average', range: '6 – 6.9h', max: 6.9, color: '#e0a070' },
      { name: 'Average', range: '7 – 7.4h', max: 7.4, color: '#B8975A' },
      { name: 'Good', range: '7.5 – 8.5h', max: 8.5, color: '#a0c870' },
      { name: 'Optimal', range: '8.5h+', max: 99, color: '#6fcf8a' }
    ],
    getContext: function(val, age, sex) {
      var peer = sex === 'female' ? 7.2 : 6.9;
      var diff = Math.round((val - peer) * 10) / 10;
      var peerDesc = 'Adults aged ' + (age ? Math.floor(age/10)*10 + 's' : 'your age');
      return '<p>' + peerDesc + ' average ' + peer + ' hours of sleep per night. '
        + (diff >= 0 ? 'You are sleeping ' + diff + 'h more than your peer group average.' 
           : 'You are sleeping ' + Math.abs(diff) + 'h less than your peer group average.')
        + '</p><p>The research consensus points to 7-9 hours as the range associated with the best cognitive performance, metabolic health, and longevity outcomes. Below 6 hours consistently, the effects compound week over week in ways most people do not notice until they get a full recovery period.</p>';
    }
  },
  steps: {
    title: 'Daily Steps',
    unit: 'k steps',
    higherIsBetter: true,
    ticks: ['< 2k', '4k', '7k', '10k', '15k+'],
    tiers: [
      { name: 'Sedentary', range: 'Under 4,000', max: 4000, color: '#e07070' },
      { name: 'Low active', range: '4,000 – 6,999', max: 6999, color: '#e0a070' },
      { name: 'Somewhat active', range: '7,000 – 9,999', max: 9999, color: '#B8975A' },
      { name: 'Active', range: '10,000 – 12,499', max: 12499, color: '#a0c870' },
      { name: 'Highly active', range: '12,500+', max: 99999, color: '#6fcf8a' }
    ],
    getContext: function(val, age, sex) {
      var peer = age && age > 50 ? 6800 : 7500;
      var peerK = (peer/1000).toFixed(1);
      return '<p>The average adult in your demographic walks roughly ' + peerK + 'k steps per day. '
        + (val >= peer ? 'You are above that benchmark.' : 'You are currently below that benchmark.')
        + '</p><p>A large 2022 meta-analysis found that mortality risk decreases meaningfully up to around 8,000-10,000 steps per day, with diminishing returns beyond that. The biggest jump in benefit is going from under 4,000 to 7,000 — the move from sedentary to moderately active.</p>';
    }
  },
  heart_rate: {
    title: 'Resting Heart Rate',
    unit: 'bpm',
    higherIsBetter: false,
    ticks: ['< 50', '55', '65', '75', '85+'],
    tiers: [
      { name: 'Athlete', range: 'Under 55 bpm', max: 55, color: '#6fcf8a' },
      { name: 'Excellent', range: '55 – 61 bpm', max: 61, color: '#a0c870' },
      { name: 'Good', range: '62 – 67 bpm', max: 67, color: '#B8975A' },
      { name: 'Average', range: '68 – 75 bpm', max: 75, color: '#e0a070' },
      { name: 'Above average', range: '76 bpm+', max: 999, color: '#e07070' }
    ],
    getContext: function(val, age, sex) {
      var peer = sex === 'female' ? 72 : 69;
      var ageAdj = age && age > 50 ? peer + 3 : peer;
      return '<p>The average resting heart rate for ' + (sex || 'adults') + ' in your age group is around ' + ageAdj + ' bpm. '
        + (val < ageAdj ? 'Your resting heart rate is below that average, which generally reflects a more efficient cardiovascular system.' 
           : 'Your resting heart rate is above the average for your peer group.')
        + '</p><p>Resting heart rate is one of the simplest long-term cardiovascular markers. A rate that trends downward over months typically reflects improving aerobic fitness. A rate that is quietly climbing week over week — even staying in a normal range — can be an early signal of accumulated stress, poor sleep, or an oncoming illness before other symptoms appear.</p>';
    }
  },
  active_cal: {
    title: 'Active Calories',
    unit: 'kcal',
    higherIsBetter: true,
    ticks: ['< 100', '200', '400', '600', '800+'],
    tiers: [
      { name: 'Minimal activity', range: 'Under 200 kcal', max: 200, color: '#e07070' },
      { name: 'Light activity', range: '200 – 399 kcal', max: 399, color: '#e0a070' },
      { name: 'Moderate activity', range: '400 – 599 kcal', max: 599, color: '#B8975A' },
      { name: 'Active', range: '600 – 799 kcal', max: 799, color: '#a0c870' },
      { name: 'Highly active', range: '800+ kcal', max: 99999, color: '#6fcf8a' }
    ],
    getContext: function(val, age, sex) {
      var peer = sex === 'female' ? 350 : 450;
      return '<p>The average active calorie burn for ' + (sex || 'adults') + ' in your peer group is around ' + peer + ' kcal per day. '
        + (val >= peer ? 'You are above that average.' : 'You are currently below that average.')
        + '</p><p>Active calories reflect the energy expended through movement beyond your baseline metabolic rate. Higher daily active burn is consistently associated with improved insulin sensitivity, lower visceral fat accumulation, and better cardiovascular markers — independent of formal exercise sessions.</p>';
    }
  },
  weight: {
    title: 'Weight Trend',
    unit: '',
    tiers: [],
    getContext: function(val, age, sex) {
      return '<p>Weight in isolation is one of the least informative health metrics. The same number on the scale looks very different depending on muscle mass, bone density, hydration, and body composition.</p><p>What matters more than where the number sits today is the direction it is trending over 4-8 weeks, and how it correlates with your other markers — particularly energy levels, sleep quality, and how you feel in daily life. Log consistently and the trend will tell you more than any single reading.</p>';
    }
  }
};

// Strength benchmarks by exercise
var strengthBenchmarks = {
  'Bench Press': {
    tiers: [
      { name: 'Beginner', range: '< 0.75x bodyweight', multiplier: 0.75, color: '#e07070' },
      { name: 'Novice', range: '0.75 – 1.0x bodyweight', multiplier: 1.0, color: '#e0a070' },
      { name: 'Intermediate', range: '1.0 – 1.25x bodyweight', multiplier: 1.25, color: '#B8975A' },
      { name: 'Advanced', range: '1.25 – 1.5x bodyweight', multiplier: 1.5, color: '#a0c870' },
      { name: 'Elite', range: '1.5x+ bodyweight', multiplier: 99, color: '#6fcf8a' }
    ],
    context: 'Bench press strength standards are typically expressed relative to bodyweight to account for size differences. These tiers reflect natural lifters with at least 6 months of consistent training. Progress from novice to intermediate typically takes 1-2 years of consistent work.'
  },
  'Squat': {
    tiers: [
      { name: 'Beginner', range: '< 1.0x bodyweight', multiplier: 1.0, color: '#e07070' },
      { name: 'Novice', range: '1.0 – 1.25x bodyweight', multiplier: 1.25, color: '#e0a070' },
      { name: 'Intermediate', range: '1.25 – 1.5x bodyweight', multiplier: 1.5, color: '#B8975A' },
      { name: 'Advanced', range: '1.5 – 2.0x bodyweight', multiplier: 2.0, color: '#a0c870' },
      { name: 'Elite', range: '2.0x+ bodyweight', multiplier: 99, color: '#6fcf8a' }
    ],
    context: 'The squat is the most comprehensive lower body strength movement. Standards are relative to bodyweight. Most people who train consistently for 2+ years land in the intermediate range. Hip mobility and ankle flexibility are common limiters independent of raw strength.'
  },
  'Deadlift': {
    tiers: [
      { name: 'Beginner', range: '< 1.0x bodyweight', multiplier: 1.0, color: '#e07070' },
      { name: 'Novice', range: '1.0 – 1.5x bodyweight', multiplier: 1.5, color: '#e0a070' },
      { name: 'Intermediate', range: '1.5 – 2.0x bodyweight', multiplier: 2.0, color: '#B8975A' },
      { name: 'Advanced', range: '2.0 – 2.5x bodyweight', multiplier: 2.5, color: '#a0c870' },
      { name: 'Elite', range: '2.5x+ bodyweight', multiplier: 99, color: '#6fcf8a' }
    ],
    context: 'The deadlift tends to have higher absolute numbers than other lifts since it uses the entire posterior chain. Standards are relative to bodyweight. The deadlift is also a strong predictor of all-cause mortality in older adults — grip strength and hip hinge strength correlate strongly with longevity.'
  },
  'Overhead Press': {
    tiers: [
      { name: 'Beginner', range: '< 0.5x bodyweight', multiplier: 0.5, color: '#e07070' },
      { name: 'Novice', range: '0.5 – 0.65x bodyweight', multiplier: 0.65, color: '#e0a070' },
      { name: 'Intermediate', range: '0.65 – 0.8x bodyweight', multiplier: 0.8, color: '#B8975A' },
      { name: 'Advanced', range: '0.8 – 1.0x bodyweight', multiplier: 1.0, color: '#a0c870' },
      { name: 'Elite', range: '1.0x+ bodyweight', multiplier: 99, color: '#6fcf8a' }
    ],
    context: 'The overhead press is one of the most technically demanding lifts and tends to progress more slowly than lower body movements. Shoulder mobility and thoracic spine extension are often the limiting factors. A bodyweight press is genuinely elite for most natural lifters.'
  }
};

function openBenchmark(metric) {
  var b = benchmarks[metric];
  if (!b) return;

  // Get user data
  var valEl = document.getElementById('d-' + (metric === 'heart_rate' ? 'hr' : metric === 'active_cal' ? 'cal' : metric));
  var rawVal = valEl ? parseFloat(valEl.textContent) : null;
  if (!rawVal) { rawVal = 0; }
  if (metric === 'steps' && rawVal < 500) rawVal = rawVal * 1000; // convert k display back to steps

  var age = null, sex = null;
  if (window.userProfileData) {
    if (window.userProfileData.birth_date) {
      age = Math.floor((Date.now() - new Date(window.userProfileData.birth_date)) / (365.25 * 24 * 3600 * 1000));
    }
    sex = window.userProfileData.gender || null;
  } else {
    var dobEl = document.getElementById('p-dob');
    var sexEl = document.getElementById('p-sex');
    if (dobEl && dobEl.value) age = Math.floor((Date.now() - new Date(dobEl.value)) / (365.25 * 24 * 3600 * 1000));
    if (sexEl) sex = sexEl.value;
  }

  // Set panel content
  document.getElementById('bench-eyebrow').textContent = 'How you compare · ' + (age ? age + ' · ' : '') + (sex || 'your peer group');
  document.getElementById('bench-title').innerHTML = b.title.replace(' ', ' <em>') + '</em>';
  document.getElementById('bench-val').textContent = metric === 'steps' ? (Math.round(rawVal/100)/10) : rawVal;
  document.getElementById('bench-unit').textContent = b.unit;
  document.getElementById('bench-val-label').textContent = 'your reading';

  // Spectrum marker position
  if (b.tiers.length > 0) {
    var allMaxes = b.tiers.map(function(t) { return t.max === 999 || t.max === 99999 ? null : t.max; }).filter(Boolean);
    var minVal = b.tiers[0].max * 0.5;
    var maxVal = allMaxes[allMaxes.length - 1] * 1.2;
    var pct = Math.min(95, Math.max(5, ((rawVal - minVal) / (maxVal - minVal)) * 100));
    if (!b.higherIsBetter) pct = 100 - pct;
    setTimeout(function() {
      document.getElementById('bench-marker').style.left = pct + '%';
    }, 100);
    document.getElementById('bench-ticks').innerHTML = b.ticks.map(function(t) {
      return '<span>' + t + '</span>';
    }).join('');
  }

  // Tiers
  var currentTierIdx = 0;
  for (var i = 0; i < b.tiers.length; i++) {
    if (rawVal <= b.tiers[i].max) { currentTierIdx = i; break; }
    if (i === b.tiers.length - 1) currentTierIdx = i;
  }
  document.getElementById('bench-tiers').innerHTML = b.tiers.map(function(tier, i) {
    var isCurrent = i === currentTierIdx;
    return '<div class="benchmark-tier ' + (isCurrent ? 'current' : '') + '">'
      + '<div class="benchmark-tier-dot" style="background:' + tier.color + '"></div>'
      + '<div class="benchmark-tier-info">'
      + '<div class="benchmark-tier-name">' + tier.name + '</div>'
      + '<div class="benchmark-tier-range">' + tier.range + '</div>'
      + '</div>'
      + (isCurrent ? '<div class="benchmark-tier-you">You are here</div>' : '')
      + '</div>';
  }).join('');

  // Context
  document.getElementById('bench-context').innerHTML = b.getContext(rawVal, age, sex);

  // Open panel
  document.getElementById('bench-panel').classList.add('open');
  document.getElementById('bench-overlay').classList.add('open');
}

function openStrengthBenchmark(exercise, weight, unit, bodyweight) {
  var b = strengthBenchmarks[exercise];
  if (!b) {
    // Generic context for exercises without specific benchmarks
    openGenericStrengthBenchmark(exercise, weight, unit);
    return;
  }

  var bw = bodyweight || 170; // fallback bodyweight in lbs
  var ratio = weight / bw;

  document.getElementById('bench-eyebrow').textContent = 'Strength benchmark';
  document.getElementById('bench-title').innerHTML = exercise.replace(' ', ' <em>') + '</em>';
  document.getElementById('bench-val').textContent = weight;
  document.getElementById('bench-unit').textContent = unit;
  document.getElementById('bench-val-label').textContent = 'your best set';

  // Spectrum
  var pct = Math.min(95, Math.max(5, (ratio / 2.5) * 100));
  setTimeout(function() {
    document.getElementById('bench-marker').style.left = pct + '%';
  }, 100);
  document.getElementById('bench-ticks').innerHTML = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'].map(function(t) {
    return '<span>' + t + '</span>';
  }).join('');

  var currentTierIdx = 0;
  for (var i = 0; i < b.tiers.length; i++) {
    if (ratio < b.tiers[i].multiplier) { currentTierIdx = i; break; }
    if (i === b.tiers.length - 1) currentTierIdx = i;
  }

  document.getElementById('bench-tiers').innerHTML = b.tiers.map(function(tier, i) {
    var isCurrent = i === currentTierIdx;
    var actualRange = tier.multiplier < 99 ? tier.range + ' (' + Math.round(tier.multiplier * bw) + ' ' + unit + ' at your weight)' : tier.range;
    return '<div class="benchmark-tier ' + (isCurrent ? 'current' : '') + '">'
      + '<div class="benchmark-tier-dot" style="background:' + tier.color + '"></div>'
      + '<div class="benchmark-tier-info">'
      + '<div class="benchmark-tier-name">' + tier.name + '</div>'
      + '<div class="benchmark-tier-range">' + actualRange + '</div>'
      + '</div>'
      + (isCurrent ? '<div class="benchmark-tier-you">You are here</div>' : '')
      + '</div>';
  }).join('');

  document.getElementById('bench-context').innerHTML = '<p>' + b.context + '</p>';

  document.getElementById('bench-panel').classList.add('open');
  document.getElementById('bench-overlay').classList.add('open');
}

function openGenericStrengthBenchmark(exercise, weight, unit) {
  document.getElementById('bench-eyebrow').textContent = 'Strength benchmark';
  document.getElementById('bench-title').innerHTML = exercise;
  document.getElementById('bench-val').textContent = weight || '—';
  document.getElementById('bench-unit').textContent = unit || '';
  document.getElementById('bench-val-label').textContent = 'your best set';
  document.getElementById('bench-tiers').innerHTML = '';
  document.getElementById('bench-ticks').innerHTML = '';
  document.getElementById('bench-context').innerHTML = '<p>Keep logging this exercise consistently. After a few sessions you will be able to see your progression trend — the most meaningful signal is not where you start but the direction and rate you are moving.</p>';
  document.getElementById('bench-panel').classList.add('open');
  document.getElementById('bench-overlay').classList.add('open');
}

function closeBenchmark() {
  document.getElementById('bench-panel').classList.remove('open');
  document.getElementById('bench-overlay').classList.remove('open');
}

// ── DATE NAVIGATION ──
var pageSelectedDate = {
  dashboard: new Date(),
  meals: new Date(),
  strength: null // null = all time
};

function formatDateLabel(date, page) {
  if (page === 'strength' && !date) return '<em>All Time</em>';
  var today = new Date();
  var yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  var todayStr = today.toDateString();
  var yesterdayStr = yesterday.toDateString();
  if (date.toDateString() === todayStr) return '<em>Today</em>';
  if (date.toDateString() === yesterdayStr) return 'Yesterday';
  // Same year - omit year
  if (date.getFullYear() === today.getFullYear()) {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getSelectedDateStr(page) {
  var d = pageSelectedDate[page];
  if (!d) return null;
  return d.toISOString().split('T')[0];
}

function stepDate(page, dir) {
  var current = pageSelectedDate[page] || new Date();
  var next = new Date(current);
  // Step by appropriate unit based on view
  if (page === 'meals' && mealsView === 'week') {
    next.setDate(next.getDate() + dir * 7);
  } else if (page === 'meals' && mealsView === 'month') {
    next.setMonth(next.getMonth() + dir);
  } else {
    next.setDate(next.getDate() + dir);
  }
  // Don't go into future
  var today = new Date();
  today.setHours(23,59,59,999);
  if (next > today) return;
  pageSelectedDate[page] = next;
  updateDateNav(page);
  reloadPageData(page);
}

function goToday(page) {
  if (page === 'strength') {
    pageSelectedDate[page] = null;
  } else {
    pageSelectedDate[page] = new Date();
  }
  updateDateNav(page);
  reloadPageData(page);
}

function updateDateNav(page) {
  var date = pageSelectedDate[page];
  var labelEl = document.getElementById(page + '-date-label');
  var nextBtn = document.getElementById(page + '-next-btn');
  var todayBtn = document.getElementById(page + '-today-btn');
  if (labelEl) labelEl.innerHTML = formatDateLabel(date, page);
  
  // Disable next button if on today
  if (nextBtn) {
    var isToday = !date || date.toDateString() === new Date().toDateString();
    nextBtn.disabled = isToday;
  }
  // Highlight today button if on today/all-time
  if (todayBtn) {
    var isDefault = page === 'strength' ? !date : (!date || date.toDateString() === new Date().toDateString());
    todayBtn.classList.toggle('active', isDefault);
  }
}

function reloadPageData(page) {
  if (page === 'dashboard') loadDashboardData();
  if (page === 'strength') renderStrengthPage();
  if (page === 'meals') {
    // Sync mealsDate from the shared pageSelectedDate system, then reload
    mealsDate = pageSelectedDate['meals'] || new Date();
    updateMealsDateLabel();
    loadMealsPage();
  }
}

// ── INIT ──
init();
