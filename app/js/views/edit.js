import * as store from '../store.js';
import { addMonths, isISODate } from '../dates.js';
import { REMIND_CHOICES } from '../model.js';
import { shrink } from '../photos.js';
import { esc, icon, promptDialog, toast } from '../ui.js';

const QUICK = [[1, '+1 month'], [3, '+3 months'], [6, '+6 months'], [12, '+1 year'], [24, '+2 years']];

let form; // the form being edited; kept across re-renders of this screen

function startForm(id) {
  const it = id ? store.findItem(id) : null;
  const settings = store.state.data.settings;
  form = {
    id: it?.id || null,
    name: it?.name || '',
    category: it?.category || '',
    got: it?.got || store.today(),
    expires: it ? Boolean(it.exp) : true,
    exp: it?.exp || '',
    remindDays: it ? (Array.isArray(it.remindDays) ? it.remindDays : settings.defaultRemindDays) : settings.defaultRemindDays,
    notes: it?.notes || '',
    existingPhoto: it?.photo || null,
    photo: undefined, // Blob = new photo, null = removed, undefined = unchanged
    previewURL: null,
  };
}

function photoBox() {
  const hasPhoto = form.previewURL || (form.existingPhoto && form.photo !== null);
  const pickers = `
    <label class="btn btn-surface" for="cam">${icon.camera()} Take photo</label>
    <label class="btn btn-surface" for="lib">${icon.image()} Choose photo</label>`;
  if (hasPhoto) {
    const src = form.previewURL ? ` src="${esc(form.previewURL)}"` : '';
    return `<div class="photo-pick has-photo">
      <img class="photo-preview" alt="Photo of this item"${src}${form.previewURL ? '' : ` data-photo-img="${esc(form.existingPhoto)}"`}>
      <div class="chip-row">${pickers}<button type="button" class="btn btn-surface" data-act="remove-photo">${icon.trash(18)} Remove</button></div>
    </div>`;
  }
  return `<div class="photo-pick">
    <span class="photo-pick-icon">${icon.camera(28)}</span>
    <span class="strong">Add a photo</span>
    <div class="chip-row">${pickers}</div>
  </div>`;
}

export function render({ params }) {
  if (!form || form.id !== (params.id || null)) startForm(params.id);
  const cats = store.state.data.categories.list;
  const allCats = form.category && !cats.includes(form.category) ? [...cats, form.category] : cats;
  return `
  <header class="topbar">
    <a class="icon-btn" href="${form.id ? `#/item/${encodeURIComponent(form.id)}` : '#/'}" aria-label="Cancel">${icon.back()}</a>
    <h1 class="h2">${form.id ? 'Edit item' : 'New item'}</h1>
    <span class="topbar-spacer"></span>
  </header>
  <form class="page" id="item-form" novalidate>
    <div id="photo-box">${photoBox()}</div>
    <input id="cam" type="file" accept="image/*" capture="environment" hidden>
    <input id="lib" type="file" accept="image/*" hidden>

    <label class="field"><span class="field-label">Name</span>
      <input class="input" id="name" name="name" required maxlength="80" placeholder="e.g. Passport, toothbrush, dog food" value="${esc(form.name)}" autocomplete="off">
    </label>

    <div class="field"><span class="field-label" id="cat-label">Category</span>
      <div class="chip-row" role="group" aria-labelledby="cat-label">
        ${allCats.map((c) => `<button type="button" class="chip${c === form.category ? ' is-on' : ''}" data-cat="${esc(c)}" aria-pressed="${c === form.category}">${esc(c)}</button>`).join('')}
        <button type="button" class="chip chip-dashed" data-act="new-cat">+ New</button>
      </div>
    </div>

    <label class="field"><span class="field-label">Got it on <span class="muted">(effective date)</span></span>
      <input class="input" id="got" type="date" required value="${esc(form.got)}">
    </label>

    <section class="card pad stack">
      <div class="row-between">
        <div class="stack-tight"><span class="strong" id="exp-label">This item expires</span>
          <span class="hint">Get reminded before it needs replacing</span></div>
        <button type="button" class="switch" role="switch" id="expires" aria-checked="${form.expires}" aria-labelledby="exp-label"><span></span></button>
      </div>
      <div class="stack" id="exp-fields"${form.expires ? '' : ' hidden'}>
        <label class="field"><span class="field-label">Expiry / replace-by date</span>
          <input class="input" id="exp" type="date" value="${esc(form.exp)}">
        </label>
        <div class="chip-row"><span class="hint">Quick:</span>
          ${QUICK.map(([m, l]) => `<button type="button" class="mini" data-quick="${m}">${l}</button>`).join('')}
        </div>
        <div class="field"><span class="field-label" id="remind-label">Remind me before</span>
          <div class="chip-row" role="group" aria-labelledby="remind-label">${REMIND_CHOICES.map((d) => `
            <button type="button" class="chip${form.remindDays.includes(d) ? ' is-on chip-mint' : ''}" data-remind="${d}" aria-pressed="${form.remindDays.includes(d)}">${d} ${d === 1 ? 'day' : 'days'}</button>`).join('')}
          </div>
        </div>
      </div>
    </section>

    <label class="field"><span class="field-label">Notes <span class="muted">(optional)</span></span>
      <textarea class="input" id="notes" rows="3" maxlength="1000" placeholder="Where is it kept? Where did you buy it?">${esc(form.notes)}</textarea>
    </label>
    <p class="form-error" id="form-error" role="alert" hidden></p>
  </form>
  <div class="actionbar">
    <button class="btn btn-primary btn-grow" type="submit" form="item-form" id="save">${icon.paw(22)} Save item</button>
  </div>`;
}

export function mount(root) {
  const $ = (s) => root.querySelector(s);
  const sync = () => {
    form.name = $('#name').value;
    form.got = $('#got').value;
    form.exp = $('#exp').value;
    form.notes = $('#notes').value;
  };
  const rerender = () => {
    sync();
    root.dispatchEvent(new CustomEvent('paw:rerender', { bubbles: true }));
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const blob = await shrink(file);
      if (form.previewURL) URL.revokeObjectURL(form.previewURL);
      form.photo = blob;
      form.previewURL = URL.createObjectURL(blob);
      rerender();
    } catch (err) {
      toast(err.message, { error: true });
    }
  };
  $('#cam').addEventListener('change', onFile);
  $('#lib').addEventListener('change', onFile);
  $('[data-act="remove-photo"]')?.addEventListener('click', () => {
    if (form.previewURL) URL.revokeObjectURL(form.previewURL);
    form.previewURL = null;
    form.photo = form.existingPhoto ? null : undefined;
    rerender();
  });

  root.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    form.category = form.category === b.dataset.cat ? '' : b.dataset.cat;
    rerender();
  }));
  $('[data-act="new-cat"]').addEventListener('click', async () => {
    const name = await promptDialog({ title: 'New category', label: 'Name', ok: 'Add' });
    if (!name) return;
    if (!store.state.data.categories.list.includes(name)) {
      await store.setCategories([...store.state.data.categories.list, name]);
    }
    form.category = name;
    rerender();
  });

  $('#expires').addEventListener('click', () => {
    form.expires = !form.expires;
    rerender();
  });
  root.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => {
    sync();
    const from = isISODate(form.got) ? form.got : store.today();
    form.exp = addMonths(from, Number(b.dataset.quick));
    $('#exp').value = form.exp;
  }));
  root.querySelectorAll('[data-remind]').forEach((b) => b.addEventListener('click', () => {
    const d = Number(b.dataset.remind);
    form.remindDays = form.remindDays.includes(d)
      ? form.remindDays.filter((x) => x !== d)
      : [...form.remindDays, d].sort((a, z) => a - z);
    rerender();
  }));

  $('#item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    sync();
    const error = (msg, field) => {
      const el = $('#form-error');
      el.textContent = msg;
      el.hidden = false;
      if (field) $(field).focus();
    };
    if (!form.name.trim()) return error('Give it a name.', '#name');
    if (!isISODate(form.got)) return error('Pick the date you got it.', '#got');
    if (form.expires && !isISODate(form.exp)) return error('Pick the expiry date, or switch off "This item expires".', '#exp');
    if (form.expires && form.exp < form.got) return error('The expiry date is before the date you got it.', '#exp');

    $('#save').disabled = true;
    const saved = await store.saveItem({
      ...(form.id ? { id: form.id } : {}),
      name: form.name.trim(),
      category: form.category,
      got: form.got,
      exp: form.expires ? form.exp : null,
      remindDays: form.remindDays,
      notes: form.notes.trim(),
    }, form.photo);
    if (form.previewURL) URL.revokeObjectURL(form.previewURL);
    form = null;
    toast('Saved!');
    location.replace(`#/item/${encodeURIComponent(saved.id)}`);
  });
}

/** Forget the half-filled form (called when leaving the add/edit screen). */
export function reset() {
  if (form?.previewURL) URL.revokeObjectURL(form.previewURL);
  form = null;
}
