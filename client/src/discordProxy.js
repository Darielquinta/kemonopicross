// src/discordProxy.js
export function applyDiscordProxy() {
  const oldFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    let url = typeof input === "string" ? input : input.url;

    // Only rewrite absolute URLs that aren't already proxied
    if (/^https?:\/\//.test(url) && !url.includes("/.proxy/")) {
      url = `/.proxy/${url}`;
      input = typeof input === "string" ? url : new Request(url, input);
    }
    return oldFetch(input, init);
  };

  // Same idea for WebSocket (Firestore uses one under the hood)
  const OldWS = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    if (/^wss?:\/\//.test(url) && !url.includes("/.proxy/")) {
      // Strip "wss://" then prepend /.proxy/
      url = `/.proxy/${url.replace(/^wss?:\/\//, "")}`;
      // Re-wrap in the current origin because the proxy lives on the same host
      url = `wss://${location.host}${url}`;
    }
    return new OldWS(url, protocols);
  };
}
