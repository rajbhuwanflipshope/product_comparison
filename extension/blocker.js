(function() {
  const origFetch = window.fetch;
  window.fetch = function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
    if (url && url.includes('sonic.fdp.api.flipkart.com')) {
      return Promise.resolve(new Response(JSON.stringify({ status: "success" }), { status: 200 }));
    }
    return origFetch.apply(this, args);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._isTelemetry = url && url.includes('sonic.fdp.api.flipkart.com');
    return origOpen.call(this, method, url, ...args);
  };

  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(...args) {
    if (this._isTelemetry) {
      Object.defineProperty(this, 'readyState', { value: 4, writable: true });
      Object.defineProperty(this, 'status', { value: 200, writable: true });
      Object.defineProperty(this, 'responseText', { value: '{"status":"success"}', writable: true });
      if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
      if (typeof this.onload === 'function') this.onload();
      return;
    }
    return origSend.apply(this, args);
  };
})();
