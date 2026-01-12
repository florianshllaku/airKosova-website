const form = document.getElementById('searchForm');
const fromSelect = form?.querySelector('select[name="departure"]');
const toSelect = form?.querySelector('select[name="destination"]');
const tripTypeSelect = form?.querySelector('select[name="tripType"], input[name="tripType"]:checked');
const returnDateInput = form?.querySelector('input[name="returnDate"]');

function buildOption(value, label) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
}

function updateDestinationOptions() {
  if (!fromSelect || !toSelect) return;
  const routes = window.AK_ROUTES || {};
  const labels = window.AK_AIRPORTS || {};
  const from = fromSelect.value;
  const allowed = Array.isArray(routes[from]) ? routes[from] : [];
  if (!allowed.length) return;

  const previous = toSelect.value;
  toSelect.innerHTML = '';
  for (const code of allowed) {
    toSelect.appendChild(buildOption(code, labels[code] || code));
  }
  if (allowed.includes(previous)) toSelect.value = previous;
  else toSelect.value = allowed[0];
}

form?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!form) return;

  const fd = new FormData(form);
  const body = Object.fromEntries(fd.entries());
  body.openBrowser = fd.get('openBrowser') === 'on';

  // Redirect immediately to a separate results page; results page will run the scrape and render.
  const sid = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  try {
    sessionStorage.setItem(`ak_payload_${sid}`, JSON.stringify(body));
    // High-accuracy epoch timestamp (ms): use performance.timeOrigin+now when available.
    const startedAtMs =
      (typeof performance !== 'undefined' && typeof performance.timeOrigin === 'number' && typeof performance.now === 'function')
        ? (performance.timeOrigin + performance.now())
        : Date.now();
    sessionStorage.setItem(`ak_startedAtMs_${sid}`, String(Math.round(startedAtMs)));
  } catch (_) {
    alert('Session storage is blocked. Please allow it so results can open in a new page.');
    return;
  }

  window.location.href = `/results?sid=${encodeURIComponent(sid)}`;
});

// Wire dependent dropdown (From -> To options)
if (fromSelect && toSelect) {
  fromSelect.addEventListener('change', updateDestinationOptions);
  updateDestinationOptions(); // initial render on load
}

// Trip type UX: returnDate is required only for roundtrip
function syncTripTypeUI() {
  if (!returnDateInput) return;
  const selected =
    (form && form.querySelector('input[name="tripType"]:checked')) ||
    (form && form.querySelector('select[name="tripType"]'));
  if (!selected) return;

  const tt = String(selected.value || 'roundtrip').toLowerCase();
  const isOneWay = tt === 'oneway';
  returnDateInput.required = !isOneWay;
  returnDateInput.disabled = isOneWay;
  if (isOneWay) returnDateInput.value = '';
}

if (returnDateInput && form) {
  // Works for both <select> and radio inputs.
  form.addEventListener('change', (e) => {
    const t = e?.target;
    if (!t) return;
    if (t.name === 'tripType') syncTripTypeUI();
  });
  syncTripTypeUI();
}


