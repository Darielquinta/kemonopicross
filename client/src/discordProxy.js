// discordProxy.js - Enhanced version for better compatibility
export function applyDiscordProxy() {
  console.log('Applying Discord proxy configuration...');
  
  // Store original functions
  const originalFetch = window.fetch.bind(window);
  const OriginalWebSocket = window.WebSocket;

  // Enhanced fetch proxy with better error handling
  window.fetch = async (input, init = {}) => {
    let url = typeof input === "string" ? input : input.url;
    let request = input;

    // Only proxy external URLs that aren't already proxied
    if (/^https?:\/\//.test(url) && !url.includes("/.proxy/")) {
      const proxyUrl = `/.proxy/${url}`;
      
      if (typeof input === "string") {
        request = proxyUrl;
      } else {
        request = new Request(proxyUrl, {
          method: input.method,
          headers: input.headers,
          body: input.body,
          mode: 'cors',
          credentials: 'omit', // Important for Discord proxying
          ...init
        });
      }
      
      console.log(`Proxying fetch: ${url} -> ${proxyUrl}`);
    }

    try {
      const response = await originalFetch(request, init);
      
      // Log non-2xx responses for debugging
      if (!response.ok) {
        console.warn(`Fetch failed: ${response.status} ${response.statusText} for ${url}`);
      }
      
      return response;
    } catch (error) {
      console.error(`Fetch error for ${url}:`, error);
      throw error;
    }
  };

  // Enhanced WebSocket proxy
  window.WebSocket = function(url, protocols) {
    let wsUrl = url;
    
    if (/^wss?:\/\//.test(url) && !url.includes("/.proxy/")) {
      // For WebSocket, we need to handle the proxy differently
      // Remove protocol and proxy through the current host
      const cleanUrl = url.replace(/^wss?:\/\//, '');
      wsUrl = `wss://${location.host}/.proxy/${cleanUrl}`;
      
      console.log(`Proxying WebSocket: ${url} -> ${wsUrl}`);
    }
    
    try {
      return new OriginalWebSocket(wsUrl, protocols);
    } catch (error) {
      console.error(`WebSocket error for ${url}:`, error);
      throw error;
    }
  };

  // Preserve WebSocket prototype
  window.WebSocket.prototype = OriginalWebSocket.prototype;
  
  // Handle Service Worker issues in Discord environment
  if (typeof ServiceWorkerContainer === 'undefined') {
    // Mock ServiceWorkerContainer to prevent errors
    window.ServiceWorkerContainer = class {
      register() {
        return Promise.reject(new Error('Service Workers not supported in Discord'));
      }
    };
    
    if (navigator && !navigator.serviceWorker) {
      navigator.serviceWorker = {
        register: () => Promise.reject(new Error('Service Workers not supported in Discord')),
        ready: Promise.reject(new Error('Service Workers not supported in Discord'))
      };
    }
  }

  console.log('Discord proxy configuration applied successfully');
}

// Additional utility to check if we're in Discord environment
export function isDiscordEnvironment() {
  return window.location.hostname.includes('discordsays.com') || 
         window.location.hostname.includes('discord.com') ||
         window.DiscordSDK !== undefined;
}

// Utility to wait for Discord readiness
export async function waitForDiscordReady(timeout = 10000) {
  if (!isDiscordEnvironment()) {
    throw new Error('Not in Discord environment');
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Discord ready timeout'));
    }, timeout);

    // Check if already ready
    if (window.DiscordSDK) {
      clearTimeout(timer);
      resolve();
      return;
    }

    // Wait for SDK to load
    const checkReady = () => {
      if (window.DiscordSDK) {
        clearTimeout(timer);
        resolve();
      } else {
        setTimeout(checkReady, 100);
      }
    };
    
    checkReady();
  });
}