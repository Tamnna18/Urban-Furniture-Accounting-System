/**
 * Urban Furniture Accounting System - Data Store & Event Bus
 * Shared Storage Layer supporting LocalStorage & In-Memory (for headless tests)
 * Provides atomic snapshot-and-rollback transaction execution.
 */

class StorageAdapter {
  constructor() {
    this.isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
    this.memoryStore = {};
  }

  getItem(key) {
    if (this.isBrowser) {
      return window.localStorage.getItem(key);
    }
    return this.memoryStore[key] !== undefined ? this.memoryStore[key] : null;
  }

  setItem(key, value) {
    if (this.isBrowser) {
      window.localStorage.setItem(key, value);
    } else {
      this.memoryStore[key] = String(value);
    }
  }

  removeItem(key) {
    if (this.isBrowser) {
      window.localStorage.removeItem(key);
    } else {
      delete this.memoryStore[key];
    }
  }

  clear() {
    if (this.isBrowser) {
      window.localStorage.clear();
    } else {
      this.memoryStore = {};
    }
  }
}

class Store {
  constructor() {
    this.adapter = new StorageAdapter();
    this.subscribers = {};
  }

  get(key, defaultValue = []) {
    const raw = this.adapter.getItem(key);
    if (!raw) return defaultValue;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('Error parsing key ' + key + ':', e);
      return defaultValue;
    }
  }

  set(key, value) {
    this.adapter.setItem(key, JSON.stringify(value));
    this.emit('change:' + key, value);
    this.emit('change', { key, value });
  }

  subscribe(event, callback) {
    if (!this.subscribers[event]) {
      this.subscribers[event] = [];
    }
    this.subscribers[event].push(callback);
    return () => {
      this.subscribers[event] = this.subscribers[event].filter(cb => cb !== callback);
    };
  }

  emit(event, payload) {
    if (this.subscribers[event]) {
      this.subscribers[event].forEach(cb => {
        try {
          cb(payload);
        } catch (err) {
          console.error('Error in event listener for ' + event + ':', err);
        }
      });
    }
  }

  /**
   * Atomic Transaction Execution with automatic rollback on failure.
   * Takes an array of keys to snapshot, runs actionFn. If actionFn throws,
   * all keys are restored to their exact snapshot state.
   */
  transaction(keys, actionFn) {
    const snapshot = {};
    keys.forEach(k => {
      snapshot[k] = this.get(k);
    });

    try {
      const result = actionFn();
      return result;
    } catch (error) {
      // Rollback
      keys.forEach(k => {
        if (snapshot[k] !== undefined) {
          this.set(k, snapshot[k]);
        }
      });
      throw error;
    }
  }
}

// Global instance
const store = new Store();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { store, Store };
} else if (typeof window !== 'undefined') {
  window.store = store;
}