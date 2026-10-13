/* Canonical offline/static-HTTP asset transport. Payloads are classic scripts,
 * never fetched, evaluated, or retained in a completed-payload cache.
 *
 * Index v1: {format:1, callback:'__roottreePortablePart', assets:{
 *   'original/relative.url': {bytes, sha256, gzipBytes,
 *     parts:[{url:'portable-payload/hash.000.js', bytes, sha256?}], mime?}
 * }}
 * Each wrapper contains only globalThis.__roottreePortablePart('BASE64');
 * document.currentScript, not wrapper-supplied identifiers, establishes identity.
 * Decoded SHA-256 is checked by StaticAssetLoader before engine use.
 */
(function (scope) {
  'use strict';
  const CALLBACK = '__roottreePortablePart';
  const MAX_PART = 8 * 1024 * 1024, MAX_DECODED = 24 * 1024 * 1024;
  const MAX_PACKED = 32 * 1024 * 1024, FEED_BYTES = 48 * 1024;
  const dispatchers = new WeakMap();
  const abortError = () => new DOMException('Portable asset loading cancelled', 'AbortError');
  const failure = (code, message) => Object.assign(new Error(message), {code});
  const invalid = message => failure('ERR_PORTABLE_INDEX', message);
  const size = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;

  function rejectTraversal(value) {
    if (/[\\?#\u0000-\u001f\u007f]/.test(value) || /%(?:2f|5c)/i.test(value)) throw failure('ERR_PORTABLE_URL', 'Unsafe portable asset URL');
    for (const segment of value.split('/')) {
      let decoded;
      try { decoded = decodeURIComponent(segment); } catch (_) { throw failure('ERR_PORTABLE_URL', 'Unsafe portable asset URL'); }
      if (decoded === '.' || decoded === '..' || /[\\\u0000-\u001f\u007f]/.test(decoded)) throw failure('ERR_PORTABLE_URL', 'Unsafe portable asset URL');
    }
  }

  function relativeURL(value, base) {
    if (typeof value !== 'string' || !value || value[0] === '/' || value.includes('%') || /^[a-z][a-z\d+.-]*:/i.test(value)) throw invalid('Invalid relative portable asset URL');
    rejectTraversal(value);
    const url = new URL(value, base);
    if (url.protocol !== base.protocol || url.host !== base.host || !url.pathname.startsWith(base.pathname)) throw invalid('Portable asset escaped its base directory');
    return url.href;
  }

  function getDispatcher(host, document) {
    let dispatcher = dispatchers.get(host);
    if (!dispatcher) {
      if (host[CALLBACK] !== undefined) throw invalid('Portable asset callback is already occupied');
      dispatcher = {documents: new Map(), scripts: new WeakMap()};
      // This function deliberately survives dispose: a late classic script safely
      // does nothing. The WeakMap contains no entry for completed/removed scripts.
      host[CALLBACK] = function (payload) {
        for (const doc of dispatcher.documents.keys()) {
          const current = doc.currentScript;
          const receive = current && dispatcher.scripts.get(current);
          if (receive) { receive(payload); return; }
        }
      };
      dispatchers.set(host, dispatcher);
    }
    dispatcher.documents.set(document, (dispatcher.documents.get(document) || 0) + 1);
    return dispatcher;
  }

  function createPortableTransport(index, manifest, options = {}) {
    const document = options.document || scope.document, host = options.global || scope;
    const DS = Object.prototype.hasOwnProperty.call(options, 'DecompressionStream') ? options.DecompressionStream : scope.DecompressionStream;
    const Stream = options.ReadableStream || scope.ReadableStream, Reply = options.Response || scope.Response;
    const decode64 = options.atob || scope.atob.bind(scope);
    const base = new URL(options.base || './', scope.location?.href || 'http://localhost/');
    const concurrency = options.concurrency ?? 2, timeoutMs = options.timeoutMs ?? 30000;
    if (!['file:', 'http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/')) throw invalid('Portable base must be an exact file or HTTP directory URL');
    if (!document?.createElement || !(document.head || document.documentElement)?.appendChild) throw invalid('Portable assets require a document for classic scripts');
    if (typeof DS !== 'function' || typeof Stream !== 'function' || typeof Reply !== 'function') throw failure('ERR_PORTABLE_CAPABILITY', 'This build requires a browser with gzip DecompressionStream and streaming Response support');
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 2 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw invalid('Invalid portable transport limits');
    if (index?.format !== 1 || (index.callback !== undefined && index.callback !== CALLBACK) || !index.assets || Array.isArray(index.assets)) throw invalid('Unsupported portable asset index');
    const assets = new Map(), descriptors = new Map();
    for (const [relative, entry] of Object.entries(index.assets)) {
      const url = relativeURL(relative, base);
      if (!entry || !size(entry.bytes, MAX_DECODED) || !/^[a-f0-9]{64}$/.test(entry.sha256) || !size(entry.gzipBytes, MAX_PACKED) || entry.gzipBytes === 0 || !Array.isArray(entry.parts) || !entry.parts.length) throw invalid('Invalid portable asset size or digest: ' + relative);
      let packedBytes = 0;
      const parts = entry.parts.map(part => {
        if (!part || !size(part.bytes, MAX_PART) || !part.bytes || (part.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(part.sha256))) throw invalid('Invalid portable part size or digest: ' + relative);
        const partURL = relativeURL(part.url, base);
        const previous = descriptors.get(partURL);
        if (previous && (previous.bytes !== part.bytes || previous.sha256 !== part.sha256)) throw invalid('Conflicting portable part descriptors');
        const descriptor = previous || Object.freeze({url: partURL, bytes: part.bytes, sha256: part.sha256});
        descriptors.set(partURL, descriptor); packedBytes += part.bytes;
        if (!Number.isSafeInteger(packedBytes) || packedBytes > MAX_PACKED) throw invalid('Portable packed byte limit exceeded');
        return descriptor;
      });
      if (packedBytes !== entry.gzipBytes) throw invalid('Portable packed length mismatch: ' + relative);
      if (entry.mime !== undefined && (typeof entry.mime !== 'string' || /[\r\n]/.test(entry.mime))) throw invalid('Invalid portable content type');
      assets.set(url, Object.freeze({bytes: entry.bytes, sha256: entry.sha256, gzipBytes: entry.gzipBytes, parts, mime: entry.mime || 'application/octet-stream'}));
    }
    const manifestURL = new URL('asset-manifest.json', base).href;
    if (assets.has(manifestURL)) throw invalid('Portable asset index shadows its manifest');
    const dispatcher = getDispatcher(host, document);
    const jobs = new Map(), queue = [], transfers = new Set(), slotQueue = [];
    const counts = {activeScripts: 0, peakScripts: 0, activeTransfers: 0, peakTransfers: 0, packedBytes: 0, peakPackedBytes: 0, base64Chars: 0, peakBase64Chars: 0, scriptLoads: 0};
    let disposed = false;
    const bump = (key, peak, n) => { counts[key] += n; counts[peak] = Math.max(counts[peak], counts[key]); };
    const pumpSoon = () => Promise.resolve().then(pump);

    function clearScript(job) {
      if (!job.script) return;
      dispatcher.scripts.delete(job.script);
      job.script.removeEventListener('load', job.onLoad);
      job.script.removeEventListener('error', job.onError);
      clearTimeout(job.timer);
      job.script.remove(); job.script = null;
      counts.activeScripts--; pumpSoon();
    }
    function clearEncoded(job) {
      if (job.encoded !== null) { counts.base64Chars -= job.encoded.length; job.encoded = null; }
    }
    function releaseClient(job, client) {
      if (!job.clients.delete(client)) return;
      client.signal?.removeEventListener('abort', client.stop);
      if (job.clients.size) return;
      if (job.state === 'loaded') {
        counts.packedBytes -= job.bytes.byteLength; job.bytes = null;
        if (jobs.get(job.part.url) === job) jobs.delete(job.part.url);
      } else if (job.state === 'queued' || job.state === 'active') failJob(job, abortError());
    }
    function failJob(job, error) {
      if (job.state !== 'queued' && job.state !== 'active') return;
      job.state = 'failed';
      clearScript(job); clearEncoded(job);
      const queued = queue.indexOf(job); if (queued >= 0) queue.splice(queued, 1);
      if (jobs.get(job.part.url) === job) jobs.delete(job.part.url);
      for (const client of job.clients) { client.signal?.removeEventListener('abort', client.stop); client.reject(error); }
      job.clients.clear();
    }
    function decodePart(encoded, expected) {
      if (encoded.length !== Math.ceil(expected / 3) * 4 || /[^A-Za-z0-9+/=]/.test(encoded)) throw failure('ERR_PORTABLE_BASE64', 'Portable part base64 length or alphabet mismatch');
      const padding = expected % 3 ? 3 - expected % 3 : 0;
      if (encoded.indexOf('=') !== (padding ? encoded.length - padding : -1) || (padding && encoded.slice(-padding) !== '='.repeat(padding))) throw failure('ERR_PORTABLE_BASE64', 'Portable part base64 padding mismatch');
      const bytes = new Uint8Array(expected); let written = 0;
      // 64KiB encoded -> 48KiB binary scratch; never an 8MiB atob string.
      for (let offset = 0; offset < encoded.length; offset += 65536) {
        let binary;
        try { binary = decode64(encoded.slice(offset, offset + 65536)); }
        catch (_) { throw failure('ERR_PORTABLE_BASE64', 'Portable part base64 is invalid'); }
        if (written + binary.length > expected) throw failure('ERR_PORTABLE_PACKED_LENGTH', 'Portable part exceeded its packed byte limit');
        for (let i = 0; i < binary.length; i++) bytes[written++] = binary.charCodeAt(i);
      }
      if (written !== expected) throw failure('ERR_PORTABLE_PACKED_LENGTH', 'Portable part packed length mismatch');
      return bytes;
    }
    function startJob(job) {
      job.state = 'active'; bump('activeScripts', 'peakScripts', 1); counts.scriptLoads++;
      const script = job.script = document.createElement('script'); script.async = true;
      job.onLoad = () => {
        if (job.state !== 'active') return;
        try {
          if (job.encoded === null) throw failure('ERR_PORTABLE_CALLBACK', 'Portable part loaded without its callback');
          job.bytes = decodePart(job.encoded, job.part.bytes);
          clearEncoded(job); clearScript(job); job.state = 'loaded';
          bump('packedBytes', 'peakPackedBytes', job.bytes.byteLength);
          for (const client of job.clients) {
            client.signal?.removeEventListener('abort', client.stop);
            client.resolve({bytes: job.bytes, release: () => releaseClient(job, client)});
          }
        } catch (error) { failJob(job, error); }
      };
      job.onError = () => failJob(job, failure('ERR_PORTABLE_SCRIPT', 'Portable asset script could not be loaded: ' + job.part.url));
      dispatcher.scripts.set(script, payload => {
        if (job.state !== 'active') return;
        if (job.encoded !== null) { failJob(job, failure('ERR_PORTABLE_CALLBACK', 'Portable part called back more than once')); return; }
        if (typeof payload !== 'string' || payload.length !== Math.ceil(job.part.bytes / 3) * 4) { failJob(job, failure('ERR_PORTABLE_BASE64', 'Portable part base64 length mismatch')); return; }
        job.encoded = payload; bump('base64Chars', 'peakBase64Chars', payload.length);
      });
      script.addEventListener('load', job.onLoad); script.addEventListener('error', job.onError);
      job.timer = setTimeout(() => failJob(job, failure('ERR_PORTABLE_TIMEOUT', 'Portable asset script timed out: ' + job.part.url)), timeoutMs);
      script.src = job.part.url;
      try { (document.head || document.documentElement).appendChild(script); }
      catch (_) { job.onError(); }
    }
    function pump() {
      while (!disposed && counts.activeScripts < concurrency && queue.length) {
        const job = queue.shift();
        if (job.state === 'queued' && job.clients.size) startJob(job);
      }
    }
    function acquirePart(part, signal) {
      if (signal.aborted || disposed) return Promise.reject(abortError());
      let job = jobs.get(part.url);
      if (!job) {
        job = {part, state: 'queued', clients: new Set(), script: null, encoded: null, bytes: null};
        jobs.set(part.url, job); queue.push(job);
      }
      return new Promise((resolve, reject) => {
        const client = {resolve, reject, signal, stop: null};
        client.stop = () => { reject(abortError()); releaseClient(job, client); };
        job.clients.add(client);
        if (job.state === 'loaded') resolve({bytes: job.bytes, release: () => releaseClient(job, client)});
        else { signal.addEventListener('abort', client.stop, {once: true}); pump(); }
      });
    }
    function acquireSlot(signal) {
      return new Promise((resolve, reject) => {
        const waiter = {signal, resolve, reject, stop: null};
        waiter.stop = () => {
          const i = slotQueue.indexOf(waiter); if (i < 0) return;
          slotQueue.splice(i, 1); signal.removeEventListener('abort', waiter.stop); reject(abortError());
        };
        slotQueue.push(waiter); signal.addEventListener('abort', waiter.stop, {once: true});
        if (signal.aborted) waiter.stop(); else pumpSlots();
      });
    }
    function pumpSlots() {
      while (!disposed && counts.activeTransfers < concurrency && slotQueue.length) {
        const waiter = slotQueue.shift(); waiter.signal.removeEventListener('abort', waiter.stop);
        if (waiter.signal.aborted) { waiter.reject(abortError()); continue; }
        bump('activeTransfers', 'peakTransfers', 1); let released = false;
        waiter.resolve(() => { if (released) return; released = true; counts.activeTransfers--; pumpSlots(); });
      }
    }

    function assetBody(entry, callerSignal) {
      const controller = new AbortController(), signal = controller.signal;
      let output, reader, releaseSlot, lease, offset = 0, partIndex = 0, packed = 0, decoded = 0, finished = false;
      const releasePart = () => { if (lease) { lease.release(); lease = null; } };
      const finish = reason => {
        if (finished) return; finished = true;
        callerSignal?.removeEventListener('abort', stop);
        transfers.delete(stop); controller.abort(reason); releasePart();
        if (reader) reader.cancel(reason).catch(() => {});
        if (releaseSlot) { releaseSlot(); releaseSlot = null; }
      };
      const stop = () => { if (finished) return; const error = abortError(); output.error(error); finish(error); };
      const check = () => { if (signal.aborted || callerSignal?.aborted || disposed) throw abortError(); };
      async function begin() {
        releaseSlot = await acquireSlot(signal);
        if (finished) { releaseSlot(); releaseSlot = null; throw abortError(); }
        check();
        let decoder;
        try { decoder = new DS('gzip'); }
        catch (_) { throw failure('ERR_PORTABLE_CAPABILITY', 'This build requires gzip DecompressionStream support'); }
        const source = new Stream({
          async pull(target) {
            check();
            if (lease && offset === lease.bytes.length) { releasePart(); offset = 0; partIndex++; }
            if (partIndex === entry.parts.length) {
              if (packed !== entry.gzipBytes) throw failure('ERR_PORTABLE_PACKED_LENGTH', 'Portable gzip length mismatch');
              target.close(); return;
            }
            if (!lease) {
              const acquired = await acquirePart(entry.parts[partIndex], signal);
              if (signal.aborted || finished) { acquired.release(); throw abortError(); }
              lease = acquired;
            }
            check();
            const end = Math.min(offset + FEED_BYTES, lease.bytes.length), bytes = lease.bytes.subarray(offset, end);
            if (packed + bytes.length > entry.gzipBytes) throw failure('ERR_PORTABLE_PACKED_LENGTH', 'Portable gzip exceeded its packed byte limit');
            packed += bytes.length; offset = end; target.enqueue(bytes);
          },
          cancel() { releasePart(); }
        }, {highWaterMark: 0});
        reader = source.pipeThrough(decoder).getReader();
      }
      return new Stream({
        start(target) {
          output = target; transfers.add(stop);
          callerSignal?.addEventListener('abort', stop, {once: true});
          if (callerSignal?.aborted || disposed) stop();
        },
        async pull(target) {
          try {
            check(); if (!reader) await begin();
            const {value, done} = await reader.read(); check();
            if (done) {
              if (decoded !== entry.bytes) throw failure('ERR_PORTABLE_DECODED_LENGTH', 'Portable decoded length mismatch');
              target.close(); finish(); return;
            }
            if (decoded + value.byteLength > entry.bytes) throw failure('ERR_PORTABLE_DECODED_LIMIT', 'Portable decoded byte limit exceeded');
            decoded += value.byteLength; target.enqueue(value);
          } catch (error) {
            if (finished) return;
            const reported = signal.aborted || callerSignal?.aborted ? abortError() : (error.code?.startsWith('ERR_PORTABLE_') ? error : failure('ERR_PORTABLE_GZIP', 'Portable gzip decompression failed'));
            target.error(reported); finish(reported);
          }
        },
        cancel(reason) { finish(reason); }
      }, {highWaterMark: 0});
    }

    async function portableFetch(input, init = {}) {
      if (disposed) throw failure('ERR_PORTABLE_DISPOSED', 'Portable asset transport has been disposed');
      const signal = init.signal === undefined ? input?.signal : init.signal;
      if (signal?.aborted) throw abortError();
      const method = String(init.method || input?.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') throw failure('ERR_PORTABLE_METHOD', 'Portable assets support GET and HEAD only');
      const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
      if (typeof value !== 'string') throw failure('ERR_PORTABLE_URL', 'Invalid portable asset URL');
      rejectTraversal(value);
      const url = new URL(value, base);
      if (url.protocol !== base.protocol || url.host !== base.host || url.username || url.password || !url.pathname.startsWith(base.pathname) || url.search || url.hash) throw failure('ERR_PORTABLE_URL', 'Unsafe portable asset URL');
      if (url.href === manifestURL) return new Reply(method === 'HEAD' ? null : JSON.stringify(manifest), {headers: {'content-type': 'application/json'}});
      const entry = assets.get(url.href);
      if (!entry) throw failure('ERR_PORTABLE_UNKNOWN', 'Asset is absent from this offline build: ' + url.pathname);
      return new Reply(method === 'HEAD' ? null : assetBody(entry, signal), {headers: {'content-type': entry.mime, 'content-length': String(entry.bytes)}});
    }
    function dispose() {
      if (disposed) return; disposed = true;
      for (const stop of [...transfers]) stop();
      for (const job of [...jobs.values()]) failJob(job, abortError());
      for (const waiter of [...slotQueue]) waiter.stop();
      const refs = dispatcher.documents.get(document) - 1;
      if (refs) dispatcher.documents.set(document, refs); else dispatcher.documents.delete(document);
    }
    return Object.freeze({fetch: portableFetch, dispose, metrics: () => ({...counts, queuedScripts: queue.length, queuedTransfers: slotQueue.length, pendingParts: jobs.size, openResponses: transfers.size})});
  }
  scope.createPortableTransport = createPortableTransport;
  if (typeof module !== 'undefined') module.exports = {createPortableTransport};
})(typeof window !== 'undefined' ? window : globalThis);
