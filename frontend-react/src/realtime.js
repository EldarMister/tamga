export function connectRealtime(token, { onEvent, onStatusChange } = {}) {
    if (!token) {
        return () => {};
    }

    let stopped = false;
    let controller = null;
    let reconnectTimer = null;

    const scheduleReconnect = () => {
        if (stopped) return;
        clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connect, 2000);
    };

    const flushEvent = (eventName, dataLines) => {
        if (!dataLines.length) return;
        try {
            const payload = JSON.parse(dataLines.join('\n'));
            onEvent?.({
                type: eventName || 'message',
                ...payload,
            });
        } catch (error) {
            console.error('Realtime parse error:', error);
        }
    };

    const readStream = async (response) => {
        if (!response.ok || !response.body) {
            throw new Error(`Realtime HTTP ${response.status}`);
        }

        onStatusChange?.('connected');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let eventName = 'message';
        let dataLines = [];

        while (!stopped) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                if (!line) {
                    flushEvent(eventName, dataLines);
                    eventName = 'message';
                    dataLines = [];
                    continue;
                }

                if (line.startsWith(':')) {
                    continue;
                }
                if (line.startsWith('event:')) {
                    eventName = line.slice(6).trim() || 'message';
                    continue;
                }
                if (line.startsWith('data:')) {
                    dataLines.push(line.slice(5).trimStart());
                }
            }
        }
    };

    const connect = async () => {
        if (stopped) return;

        controller = new AbortController();
        onStatusChange?.('connecting');

        try {
            const response = await fetch('/api/realtime/stream', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'text/event-stream',
                    'Cache-Control': 'no-cache',
                },
                cache: 'no-store',
                signal: controller.signal,
            });
            await readStream(response);
        } catch (error) {
            if (stopped || error.name === 'AbortError') {
                return;
            }
            console.error('Realtime connection error:', error);
            onStatusChange?.('reconnecting');
        }

        scheduleReconnect();
    };

    connect();

    return () => {
        stopped = true;
        clearTimeout(reconnectTimer);
        controller?.abort();
    };
}
