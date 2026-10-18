// js/tixxiWhep.js
//
// Plays a COR/Tixxi camera's live stream straight from Tixxi in the browser.
//
// Tixxi's WHEP is not single-URL WHEP: it's a two-step negotiation --
// POST /app/session/start -> sessionId, then POST /app/whep/<sessionId> with
// an SDP offer. The media is H.265/HEVC, which is why the video element gets
// the stream directly and nothing transcodes it: Chrome decodes HEVC, so the
// stream never has to pass through a server.
//
// Firefox has no HEVC-over-WebRTC support (tested 2026-10-18: Chrome plays,
// Firefox does not), so callers should check isSupported() first and show a
// message instead of a black frame.
//
// Sessions last ~70-90s without a heartbeat, so one is sent every 20s; and
// they're a scarce shared resource (Tixxi tops out around 12-16 new sessions
// per minute, competing with scheduled inference), so stop() always releases
// the session rather than letting it time out.

(function () {
    'use strict';

    const HEARTBEAT_MS = 20000;

    /** True if this browser can decode the H.265 the cameras publish. */
    function isSupported() {
        if (!window.RTCPeerConnection || !window.RTCRtpReceiver ||
            !RTCRtpReceiver.getCapabilities) {
            return false;
        }
        const caps = RTCRtpReceiver.getCapabilities('video');
        return !!(caps && caps.codecs.some(c => /H265|HEVC/i.test(c.mimeType)));
    }

    /**
     * Opens a camera's stream into a <video> element.
     *
     * @param {{origin: string, code: string, key: string}} creds
     * @param {HTMLVideoElement} videoEl
     * @param {{onError?: function(Error)}} [opts]
     * @returns {Promise<{stop: function}>}
     */
    async function play(creds, videoEl, opts) {
        const options = opts || {};
        const origin = String(creds.origin).replace(/\/$/, '');

        // Step 1: session/start. Short-lived and not renewable -- only the
        // heartbeat below keeps it alive.
        const startRes = await fetch(origin + '/app/session/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: creds.code, key: creds.key })
        });
        if (!startRes.ok) {
            throw new Error('Tixxi session/start falhou (' + startRes.status + ')');
        }
        const sessionId = (await startRes.json()).sessionId;
        if (!sessionId) throw new Error('Tixxi session/start não retornou sessionId');

        const pc = new RTCPeerConnection();
        let heartbeat = null;
        let stopped = false;

        const stop = function () {
            if (stopped) return;
            stopped = true;
            if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
            try { pc.close(); } catch (e) { /* already closed */ }
            if (videoEl) videoEl.srcObject = null;
            // Release the session instead of waiting for it to expire: the
            // per-minute session budget is shared with scheduled inference.
            fetch(origin + '/app/session/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: sessionId }),
                keepalive: true
            }).catch(function () { /* best effort */ });
        };

        try {
            pc.addTransceiver('video', { direction: 'recvonly' });
            pc.addTransceiver('audio', { direction: 'recvonly' });

            pc.ontrack = function (e) {
                if (videoEl && e.streams && e.streams[0]) {
                    videoEl.srcObject = e.streams[0];
                }
            };
            pc.oniceconnectionstatechange = function () {
                if (pc.iceConnectionState === 'failed' && options.onError) {
                    options.onError(new Error('Conexão com a câmera falhou'));
                }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Step 2: the actual WHEP exchange.
            const whepRes = await fetch(origin + '/app/whep/' + sessionId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/sdp' },
                body: offer.sdp
            });
            const answer = await whepRes.text();
            if (!whepRes.ok) {
                throw new Error('Tixxi WHEP falhou (' + whepRes.status + ')');
            }
            await pc.setRemoteDescription({ type: 'answer', sdp: answer });

            heartbeat = setInterval(function () {
                fetch(origin + '/app/session/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: sessionId })
                }).catch(function () { /* next tick retries */ });
            }, HEARTBEAT_MS);

            return { stop: stop, sessionId: sessionId };
        } catch (err) {
            stop();
            throw err;
        }
    }

    /**
     * Resolves which source a camera should be played from.
     *
     * COR cameras are stored pointing at the bridge's RTSP URL (that is what
     * camera-vision-ai consumes for inference); the UI doesn't use that path,
     * it only reads the camera code out of `subpath` and goes straight to Tixxi.
     */
    function resolveSource(camera) {
        const subpath = String((camera && camera.subpath) || '').replace(/^\/+/, '');
        if (subpath.indexOf('cor_') === 0) {
            return { type: 'whep', code: subpath.slice(4) };
        }
        const protocol = String((camera && camera.protocol) || '').toLowerCase();
        if (protocol === 'http' || protocol === 'https') {
            return { type: 'image', url: camera.url };
        }
        // Plain RTSP from third parties: browsers can't open it, and it is
        // explicitly out of scope.
        return { type: 'unsupported' };
    }

    window.TixxiWhep = {
        isSupported: isSupported,
        play: play,
        resolveSource: resolveSource
    };
})();
