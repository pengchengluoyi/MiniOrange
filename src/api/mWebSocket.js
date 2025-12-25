// /Users/cpc/code/MiniOrange/src/api/mWebSocket.js

export default class MWebSocket {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.listeners = {};
        this.pendingRequests = new Map(); // Map<req_id, {resolve, reject, timer}>
        this.reconnectTimer = null;
    }

    connect() {
        if (this.ws) this.ws.close();
        try {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('MWebSocket Connected:', this.url);
                this.emit('open');
            };

            this.ws.onmessage = (event) => {
                try {
                    const response = JSON.parse(event.data);

                    // 1. Handle Request-Response (req_id)
                    if (response.req_id && this.pendingRequests.has(response.req_id)) {
                        const { resolve, reject, timer } = this.pendingRequests.get(response.req_id);
                        clearTimeout(timer);
                        this.pendingRequests.delete(response.req_id);

                        if (response.code === 200) {
                            resolve(response);
                        } else {
                            reject(response); // Reject with full response object for error handling
                        }
                    }

                    // 2. Emit generic events (for subscriptions/push)
                    if (response.action) {
                        this.emit(response.action, response);
                    }
                    this.emit('message', response);

                } catch (e) {
                    console.error('MWebSocket JSON Parse Error:', e, event.data);
                }
            };

            this.ws.onclose = (e) => {
                console.log('MWebSocket Closed:', e.code);
                this.emit('close', e);
                this.ws = null;

                // Reject all pending requests
                this.pendingRequests.forEach(({ reject, timer }) => {
                    clearTimeout(timer);
                    reject(new Error('WebSocket connection closed'));
                });
                this.pendingRequests.clear();
            };

            this.ws.onerror = (e) => {
                console.error('MWebSocket Error:', e);
                this.emit('error', e);
            };
        } catch (e) {
            console.error('MWebSocket Connection Failed:', e);
        }
    }

    /**
     * Send a request and wait for response
     * @param {string} action - The action name (e.g., 'upload')
     * @param {object} data - The data payload
     * @param {number} timeout - Timeout in ms
     * @returns {Promise<any>}
     */
    sendRequest(action, data = {}, timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                return reject(new Error('WebSocket not connected'));
            }

            const req_id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

            const payload = {
                action,
                req_id,
                data
            };

            const timer = setTimeout(() => {
                if (this.pendingRequests.has(req_id)) {
                    this.pendingRequests.delete(req_id);
                    reject(new Error(`Request timeout: ${action}`));
                }
            }, timeout);

            this.pendingRequests.set(req_id, { resolve, reject, timer });

            this.ws.send(JSON.stringify(payload));
        });
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    on(event, callback) { if (!this.listeners[event]) this.listeners[event] = []; this.listeners[event].push(callback); }
    off(event, callback) { if (!this.listeners[event]) return; this.listeners[event] = this.listeners[event].filter(cb => cb !== callback); }
    emit(event, data) { if (this.listeners[event]) this.listeners[event].forEach(cb => cb(data)); }
    close() { if (this.ws) { this.ws.close(); this.ws = null; } }
}