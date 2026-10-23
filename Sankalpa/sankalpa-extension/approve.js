// Small window that asks Chrome for a permission (site access or the debugger), then reports back.
const q = new URLSearchParams(location.search);
const origin = q.get('origin');
const wantDebugger = q.get('debugger') === '1';
const items = [];
if (origin) items.push(`<p><strong>Read and test ${origin.replace(/[<>&"]/g, '')}</strong><br><span class="muted small">Needed to find forms, check them, and (only if you approve server checks) re-send their requests.</span></p>`);
if (wantDebugger) items.push('<p><strong>Type with a real keyboard</strong><br><span class="muted small">Uses Chrome\'s debugger only while typing tests run, then detaches. Chrome shows a "started debugging" bar during that time.</span></p>');
document.getElementById('what').innerHTML = items.join('');
const finish = (granted) => chrome.runtime.sendMessage({ type: 'approved', payload: { id: q.get('id'), granted } }).finally(() => window.close());
document.getElementById('allow').onclick = async () => {
  const granted = await chrome.permissions.request({ origins: origin ? [`${origin}/*`] : [], permissions: wantDebugger ? ['debugger'] : [] }).catch(() => false);
  finish(granted);
};
document.getElementById('cancel').onclick = () => finish(false);
document.getElementById('allow').focus();
