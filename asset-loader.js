/* Static Godot asset bridge. No service worker, account, backend or save access. */
(function (scope) {
  'use strict';
  const abortError = () => new DOMException('Loading cancelled', 'AbortError');
  class StaticAssetLoader {
    constructor(engine, manifest, options = {}) {
      this.engine = engine; this.manifest = manifest;
      this.base = new URL(options.base || './', scope.location?.href || 'http://localhost/');
      this.fetch = options.fetch || scope.fetch.bind(scope);
      this.progress = options.progress || (() => {});
      this.mounted = new Set(); this.staged = new Set(); this.inflight = new Map();
      this.temporaryFiles = new Map(); this.temporaryBytes = 0; this.maxDirectAssemblyBytes = 0; this.assetSequence = 0; this.assetActive = 0; this.assetQueue = [];
      this.mountedBytes = 0; this.stagedBytes = 0; this.maxAssemblyBytes = 0;
      if (manifest.format !== 1) throw Error('Unsupported asset manifest');
    }
    url(relative) {
      const url = new URL(relative, this.base);
      if (url.origin !== this.base.origin || !url.pathname.startsWith(this.base.pathname) || /[?#]/.test(relative)) throw Error('Unsafe asset URL');
      return url;
    }
    async verifiedChunk(chunk, signal) {
      if (!Number.isSafeInteger(chunk.bytes) || chunk.bytes < 0 || chunk.bytes > 24 * 1024 * 1024) throw Error('Invalid chunk size');
      let last;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (signal?.aborted) throw abortError();
        try {
          const response = await this.fetch(this.url(chunk.url), {signal, cache: 'default'});
          if (!response.ok) throw Error(`Asset request failed (${response.status})`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.byteLength !== chunk.bytes) throw Error('Asset length mismatch');
          const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
          if (signal?.aborted) throw abortError();
          const hex = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
          if (hex !== chunk.sha256) throw Error('Asset integrity check failed');
          return bytes;
        } catch (error) {
          if (signal?.aborted || error.name === 'AbortError') throw abortError();
          last = error;
          if (attempt < 2) await new Promise((resolve, reject) => {
            const stop = () => {clearTimeout(timer); reject(abortError());};
            const timer = setTimeout(() => {signal?.removeEventListener('abort', stop); resolve();}, 400 * 2 ** attempt);
            signal?.addEventListener('abort', stop, {once: true});
          });
        }
      }
      throw last;
    }
    async verifiedWasmChunk(chunk, signal, DS = scope.DecompressionStream) {
      const loader = this;
      const abort = () => { if (signal?.aborted) throw new DOMException('Loading cancelled', 'AbortError'); };
      if (!Number.isSafeInteger(chunk.bytes) || chunk.bytes < 0 || chunk.bytes > 24 * 1024 * 1024) throw Error('Invalid decoded chunk size');
      abort();
      if (!chunk.gzip) return loader.verifiedChunk(chunk, signal);
      let decoder;
      try { decoder = new DS('gzip'); }
      catch (_) { return loader.verifiedChunk(chunk, signal); } // Capability fallback only.
      const packed = await loader.verifiedChunk(chunk.gzip, signal); // Compressed length + SHA256 checked first.
      abort();
      let offset = 0;
      const source = new ReadableStream({
        pull(controller) {
          abort();
          if (offset === packed.length) { controller.close(); return; }
          const end = Math.min(offset + 65536, packed.length);
          controller.enqueue(packed.subarray(offset, end)); offset = end;
        }
      });
      const reader = source.pipeThrough(decoder).getReader();
      const stop = () => { reader.cancel(new DOMException('Loading cancelled', 'AbortError')).catch(() => {}); };
      signal?.addEventListener('abort', stop, {once: true});
      const raw = new Uint8Array(chunk.bytes); let written = 0;
      try {
        for (;;) {
          abort(); const {value, done} = await reader.read(); abort();
          if (done) break;
          if (written + value.length > raw.length) throw Error('Decoded byte limit exceeded');
          raw.set(value, written); written += value.length;
        }
        if (written !== chunk.bytes) throw Error('Decoded length mismatch');
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw)); abort();
        if (Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('') !== chunk.sha256) throw Error('Decoded integrity check failed');
        return raw;
      } catch (error) { await reader.cancel(error).catch(() => {}); throw error; }
      finally { signal?.removeEventListener('abort', stop); reader.releaseLock(); }
    }
    required(resource) {
      const visited = new Set(), ids = new Set(), todo = [resource.replace(/^res:\/\//, '')];
      while (todo.length) {
        const path = todo.pop(); if (visited.has(path)) continue; visited.add(path);
        const owner = this.manifest.owners[path]; if (owner) ids.add(owner);
        todo.push(...(this.manifest.dependencies[path] || []));
      }
      return [...ids].sort();
    }
    async stage(id, signal) {
      if (signal?.aborted) throw abortError();
      if (this.mounted.has(id) || this.staged.has(id)) return `/packs/${id}.zip`;
      let job = this.inflight.get(id);
      if (!job || job.controller.signal.aborted) {
        job = {controller: new AbortController(), clients: new Set(), promise: null};
        this.inflight.set(id, job);
        const current = job;
        // Start after the first consumer has registered its interest.
        job.promise = Promise.resolve().then(() => this._stagePack(id, current.controller.signal)).finally(() => {
          if (this.inflight.get(id) === current) this.inflight.delete(id);
        });
      }
      return new Promise((resolve, reject) => {
        const client = {}; job.clients.add(client); let settled = false;
        const finish = (error, value, cancelled = false) => {
          if (settled) return; settled = true;
          signal?.removeEventListener('abort', stop); job.clients.delete(client);
          if (cancelled && !job.clients.size) job.controller.abort();
          if (error) reject(error); else resolve(value);
        };
        const stop = () => finish(abortError(), undefined, true);
        signal?.addEventListener('abort', stop, {once: true});
        if (signal?.aborted) stop();
        job.promise.then(value => signal?.aborted ? stop() : finish(null, value), error => finish(error));
      });
    }
    async _stagePack(id, signal) {
      if (signal.aborted) throw abortError();
      const pack = this.manifest.packs[id]; if (!pack) throw Error('Unknown resource pack');
      if (!Number.isSafeInteger(pack.bytes) || pack.bytes < 0 || pack.chunks.reduce((n,c) => n+c.bytes,0) !== pack.bytes) throw Error('Invalid pack size');
      // One assembly buffer plus one <=24MiB chunk. No array of full-size chunk copies.
      let assembled = new Uint8Array(pack.bytes); let offset = 0;
      this.maxAssemblyBytes = Math.max(this.maxAssemblyBytes, pack.bytes + Math.max(...pack.chunks.map(c=>c.bytes)));
      for (const chunk of pack.chunks) {
        const part = await this.verifiedChunk(chunk, signal); assembled.set(part, offset); offset += part.length;
        this.progress({stage: 'download', pack: id, done: offset, total: pack.bytes, ...this.metrics()});
      }
      if (signal.aborted) throw abortError();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', assembled));
      if (signal.aborted) throw abortError();
      const hex = Array.from(digest, b => b.toString(16).padStart(2,'0')).join('');
      if (hex !== pack.sha256) throw Error('Pack integrity check failed');
      this.progress({stage: 'copy', pack: id, done: offset, total: pack.bytes, ...this.metrics()});
      if (signal.aborted) throw abortError();
      this.engine.copyToFS(`/packs/${id}.zip`, assembled);
      assembled = null; this.staged.add(id); this.stagedBytes += pack.bytes;
      return `/packs/${id}.zip`;
    }
    _acquireAssetSlot(signal) {
      if (signal?.aborted) return Promise.reject(abortError());
      if (this.assetActive < 2 && !this.assetQueue.length) {
        this.assetActive++; return null;
      }
      return new Promise((resolve, reject) => {
        const waiter = {resolve, reject, signal, stop: null};
        waiter.stop = () => {
          const index = this.assetQueue.indexOf(waiter);
          if (index < 0) return;
          this.assetQueue.splice(index, 1); signal.removeEventListener('abort', waiter.stop); reject(abortError());
        };
        this.assetQueue.push(waiter); signal?.addEventListener('abort', waiter.stop, {once: true});
        if (signal?.aborted) waiter.stop();
      });
    }
    _releaseAssetSlot() {
      while (this.assetQueue.length) {
        const waiter = this.assetQueue.shift();
        waiter.signal?.removeEventListener('abort', waiter.stop);
        if (waiter.signal?.aborted) {waiter.reject(abortError()); continue;}
        // Keep the active count reserved until this FIFO waiter resumes.
        waiter.resolve(); return;
      }
      this.assetActive--;
    }
    async stageAsset(resource, signal) {
      const waiting = this._acquireAssetSlot(signal);
      if (waiting) await waiting;
      try {if (signal?.aborted) throw abortError(); return await this._stageAsset(resource, signal);}
      finally {this._releaseAssetSlot();}
    }
    async _stageAsset(resource, signal) {
      const asset = this.manifest.assets?.[resource.replace(/^res:\/\//, '')];
      if (!asset) throw Error('Asset is absent from this build: ' + resource);
      if (!Number.isSafeInteger(asset.bytes) || asset.bytes < 0 || asset.chunks.reduce((n,c)=>n+c.bytes,0) !== asset.bytes) throw Error('Invalid direct asset size');
      this.maxDirectAssemblyBytes = Math.max(this.maxDirectAssemblyBytes, asset.bytes + Math.max(...asset.chunks.map(c=>c.bytes)));
      let bytes = new Uint8Array(asset.bytes), offset = 0;
      for (const chunk of asset.chunks) {
        const part = await this.verifiedChunk(chunk, signal); bytes.set(part, offset); offset += part.length;
        this.progress({stage: 'asset', resource, done: offset, total: asset.bytes, ...this.metrics()});
      }
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      if (Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('') !== asset.sha256) throw Error('Asset integrity check failed');
      if (signal?.aborted) throw abortError();
      const path = `/tmp/web-assets/${asset.sha256}-${++this.assetSequence}.${asset.extension}`;
      this.engine.copyToFS(path, bytes); this.temporaryFiles.set(path, asset.bytes); this.temporaryBytes += asset.bytes; bytes = null;
      return {path, settings: asset.settings || {}};
    }
    async ensure(resource, signal) {
      if (signal?.aborted) throw abortError();
      const paths = [];
      for (const id of this.required(resource)) if (!this.mounted.has(id)) paths.push(await this.stage(id, signal));
      if (signal?.aborted) throw abortError();
      return paths;
    }
    mountedPack(path) {
      const id = path.split('/').pop().replace(/\.zip$/, '');
      if (!this.staged.has(id) || this.mounted.has(id)) return;
      this.staged.delete(id); this.stagedBytes -= this.manifest.packs[id].bytes;
      this.mounted.add(id); this.mountedBytes += this.manifest.packs[id].bytes;
    }
    releasedAsset(path) {this.temporaryBytes -= this.temporaryFiles.get(path) || 0; this.temporaryFiles.delete(path);}
    metrics() {return {temporaryBytes: this.temporaryBytes, temporaryFiles: this.temporaryFiles.size, maxDirectAssemblyBytes: this.maxDirectAssemblyBytes, activeAssetTransfers: this.assetActive, mountedBytes: this.mountedBytes, stagedBytes: this.stagedBytes, maxAssemblyBytes: this.maxAssemblyBytes, jsHeapBytes: scope.performance?.memory?.usedJSHeapSize || null};}
  }
  scope.StaticAssetLoader = StaticAssetLoader;
  if (typeof module !== 'undefined') module.exports = {StaticAssetLoader};
  scope.installRoottreeAssetBridge = function (engine, manifest, options = {}) {
    const loader = new StaticAssetLoader(engine, manifest, options); const controllers = new Map();
    scope.roottreeAssets = {
      loader,
      ensure(id, resource, callback) {
        const controller = new AbortController(); controllers.set(id, controller);
        const run = async () => {while (true) {
          try { return await loader.ensure(resource, controller.signal); }
          catch (error) {if (error.name === 'AbortError' || !options.retry || !await options.retry(error, resource, controller.signal)) throw error;}
        }};
        run().then(paths => callback(id, JSON.stringify(paths), ''), error => callback(id, '[]', error.message)).finally(() => controllers.delete(id));
      },
      asset(id, resource, callback) {
        const controller = new AbortController(); controllers.set(id, controller);
        const run = async () => {
          while (true) {
            try { return await loader.stageAsset(resource, controller.signal); }
            catch(error) {
              if (error.name === 'AbortError' || !options.retry) throw error;
              if (!await options.retry(error, resource, controller.signal)) throw abortError();
            }
          }
        };
        run().then(result => callback(id, JSON.stringify(result), ''), error => callback(id, '{}', error.message)).finally(() => controllers.delete(id));
      },
      mounted(path) {loader.mountedPack(path);},
      released(path) {loader.releasedAsset(path);},
      cancel(id) {controllers.get(id)?.abort();},
      cancelAll() {for(const controller of controllers.values())controller.abort();},
      pending() {return controllers.size;},
      metrics() {return JSON.stringify(loader.metrics());}
    };
    return loader;
  };
})(typeof window !== 'undefined' ? window : globalThis);
