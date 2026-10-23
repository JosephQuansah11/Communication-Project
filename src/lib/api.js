const jsonHeaders = { 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const response = await fetch(path, options);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload;
}

export function fetchDecks() {
  return request('/api/decks');
}

export function fetchDeck(id) {
  return request(`/api/decks/${id}`);
}

export function saveDeck(deck) {
  return request('/api/decks', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ deck }),
  });
}

export function deleteDeck(id) {
  return request(`/api/decks/${id}`, { method: 'DELETE' });
}

export async function importDeck(file, onProgress) {
  const body = new FormData();
  body.append('file', file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/import');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let payload = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
      else reject(new Error(payload?.error || `Import failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Import failed — the server could not be reached.'));
    xhr.send(body);
  });
}

export async function uploadAsset(deckId, file) {
  const body = new FormData();
  body.append('file', file);
  return request(`/api/decks/${deckId}/assets`, { method: 'POST', body });
}

export function wsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function liveUrl(code) {
  return `${window.location.origin}/live/${code}`;
}
