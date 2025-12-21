export default class MWebSocket {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.listeners = {};
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

                    console.log(event)
                    const data = JSON.parse(event.data);
                    this.emit('message', data);
                } catch (e) {
                    console.error('MWebSocket JSON Parse Error:', e);
                }
            };
            
            this.ws.onclose = (e) => {
                console.log('MWebSocket Closed:', e.code);
                this.emit('close', e);
            };
            
            this.ws.onerror = (e) => {
                console.error('MWebSocket Error:', e);
                this.emit('error', e);
            };
        } catch (e) {
            console.error('MWebSocket Connection Failed:', e);
        }
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