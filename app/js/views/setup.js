import * as store from '../store.js';
import { esc, icon, toast } from '../ui.js';

const CLASSIC_URL = 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=Pawventory';
const FINE_URL = 'https://github.com/settings/personal-access-tokens/new';

export function render() {
  const connected = store.state.mode === 'github';
  return `
  <main class="page page-setup">
    <div class="setup-hero">
      <div class="brand-mark brand-mark-lg">${icon.paw(56)}</div>
      <h1 class="h1">Pawventory</h1>
      <p class="lead">Keep track of your things, how old they are, and when to replace them.</p>
    </div>

    ${connected ? `<p class="note">${icon.cloud(20)}<span>Already connected as <b>${esc(store.state.meta.login)}</b>.</span></p>` : ''}

    <section class="card pad stack">
      <h2 class="h2">Sync with GitHub</h2>
      <p class="hint">Your things and photos are saved in a <b>private</b> repo called <b>${store.DATA_REPO}</b> that the app creates for you. Use the same token on your iPhone and your Mac.</p>
      <ol class="steps">
        <li><a class="link" href="${CLASSIC_URL}" target="_blank" rel="noopener">Create a GitHub token</a> (the <b>repo</b> and <b>workflow</b> boxes are already ticked). Pick an expiration, then tap <b>Generate token</b>.</li>
        <li>Copy the token and paste it here.</li>
      </ol>
      <details class="details"><summary>Prefer a fine-grained token?</summary>
        <p class="hint"><a class="link" href="${FINE_URL}" target="_blank" rel="noopener">Create a fine-grained token</a> with <b>Repository access: All repositories</b> (so the app can create the private repo) and these repository permissions set to <b>Read and write</b>: Administration, Contents, Workflows, Actions.</p>
      </details>
      <form class="stack" id="connect-form">
        <label class="field"><span class="field-label">GitHub token</span>
          <input class="input" id="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ghp_… or github_pat_…" required>
        </label>
        <button class="btn btn-primary" id="connect">${icon.cloud(20)} Connect</button>
        <p class="hint" id="progress" role="status"></p>
        <p class="form-error" id="connect-error" role="alert" hidden></p>
      </form>
      <p class="hint">The token stays on this device. It is only sent to GitHub.</p>
    </section>

    ${connected ? '<a class="btn btn-soft" href="#/">Back to my things</a>'
    : '<button class="btn btn-ghost" data-act="local">Try it on this device only</button>'}
  </main>`;
}

export function mount(root) {
  const $ = (q) => root.querySelector(q);
  $('#connect-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tokenValue = $('#token').value.trim();
    const err = $('#connect-error');
    err.hidden = true;
    if (!tokenValue) {
      err.textContent = 'Paste your token first.';
      err.hidden = false;
      return;
    }
    $('#connect').disabled = true;
    try {
      await store.connect(tokenValue, (step) => { $('#progress').textContent = step; });
      toast('Connected! Your things now sync.');
      location.hash = '#/';
    } catch (ex) {
      const { explainError } = await import('../github.js');
      err.textContent = explainError(ex);
      err.hidden = false;
      $('#progress').textContent = '';
      $('#connect').disabled = false;
    }
  });
  $('[data-act="local"]')?.addEventListener('click', () => {
    store.useLocalOnly();
    location.hash = '#/';
  });
}
