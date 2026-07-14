(() => {
  const params = new URLSearchParams(window.location.search);
  const payload = {
    type: 'patzer:book-oauth-callback',
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error') || params.get('error_description'),
  };
  const persist = () => {
    try {
      window.localStorage.setItem('patzer.lichess.bookOAuthCallback', JSON.stringify(payload));
    } catch {
      // The same-origin opener handoff is primary.
    }
  };
  const notifyOpener = () => {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
    }
  };
  persist();
  notifyOpener();
  window.setTimeout(notifyOpener, 150);
  window.setTimeout(() => window.close(), 1000);
  window.addEventListener('pagehide', persist, { once: true });
})();
