// Minimal GitHub REST client for the private data repo.

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const utf8ToBase64 = (text) => bytesToBase64(new TextEncoder().encode(text));
const base64ToUtf8 = (b64) => new TextDecoder().decode(base64ToBytes(b64));

export function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

export class GitHub {
  constructor(token) {
    this.token = token;
  }

  async request(method, path, { body, accept = 'application/vnd.github+json', raw = false } = {}) {
    const res = await fetch(`${API}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        Accept: accept,
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let message = res.statusText;
      try {
        message = (await res.json()).message || message;
      } catch { /* not JSON */ }
      throw new GitHubError(res.status, message);
    }
    if (raw) return res;
    return res.status === 204 ? null : res.json();
  }

  user() {
    return this.request('GET', '/user');
  }

  async repo(owner, name) {
    try {
      return await this.request('GET', `/repos/${owner}/${name}`);
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  }

  createPrivateRepo(name, description) {
    return this.request('POST', '/user/repos', {
      body: { name, description, private: true, auto_init: true, has_issues: false, has_wiki: false, has_projects: false },
    });
  }

  /** A text file, or null when it does not exist. */
  async readText(owner, repo, path, ref) {
    try {
      const q = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      const file = await this.request('GET', `/repos/${owner}/${repo}/contents/${encodePath(path)}${q}`);
      return { sha: file.sha, text: base64ToUtf8(file.content || '') };
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  }

  /** sha of an existing file, or null. */
  async sha(owner, repo, path) {
    try {
      return (await this.request('GET', `/repos/${owner}/${repo}/contents/${encodePath(path)}`)).sha;
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  }

  async readBlob(owner, repo, path) {
    const res = await this.request('GET', `/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
      accept: 'application/vnd.github.raw', raw: true,
    });
    return res.blob();
  }

  /** Creates or replaces a file. Pass the current sha to replace; omit it to create. */
  async write(owner, repo, path, { text, bytes, sha, message, branch }) {
    const content = text != null ? utf8ToBase64(text) : bytesToBase64(bytes);
    const res = await this.request('PUT', `/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
      body: { message, content, ...(sha ? { sha } : {}), ...(branch ? { branch } : {}) },
    });
    return { sha: res.content.sha };
  }

  async remove(owner, repo, path, { sha, message, branch }) {
    await this.request('DELETE', `/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
      body: { message, sha, ...(branch ? { branch } : {}) },
    });
  }

  dispatchWorkflow(owner, repo, file, ref, inputs) {
    return this.request('POST', `/repos/${owner}/${repo}/actions/workflows/${file}/dispatches`, {
      body: { ref, inputs },
    });
  }
}

/** Plain-language explanation for a failed GitHub call. */
export function explainError(err) {
  if (!navigator.onLine) return 'You are offline. Changes are saved on this device and will sync later.';
  if (!(err instanceof GitHubError)) return err?.message || 'Something went wrong.';
  if (err.status === 401) return 'GitHub did not accept the token. It may have expired: create a new one and reconnect in Settings.';
  if (err.status === 403) return `GitHub refused: the token is missing a permission (${err.message}).`;
  if (err.status === 404) return 'GitHub could not find it: check the token can access your repositories.';
  return `GitHub error ${err.status}: ${err.message}`;
}
