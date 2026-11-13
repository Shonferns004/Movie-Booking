'use strict';

/**
 * Cloudflare Workers shim for `iconv-lite`.
 *
 * `iconv-lite@0.4` (pulled in by the body-parser → raw-body chain) declares a
 * "browser" field that stubs out `lib/streams` and `lib/extend-node`. Wrangler bundles
 * with browser resolution, so those modules become empty - but Workers still report
 * `process.versions.node`, which makes iconv-lite take its Node path and call the
 * stubbed modules, crashing the Worker at startup with
 * "require_streams(...) is not a function".
 *
 * The API server only parses JSON request bodies, which are UTF-8 by definition, so
 * this shim implements the handful of iconv-lite functions raw-body calls and rejects
 * every other charset with a 415 instead of mis-decoding it.
 *
 * Wired up with `alias` in wrangler.jsonc. The Node host keeps the real package.
 */

const { Transform } = require('node:stream');

const ALIASES = {
  'utf8': 'utf-8',
  'utf-8': 'utf-8',
  'utf16le': 'utf-16le',
  'utf-16le': 'utf-16le',
  'ucs2': 'utf-16le',
  'ucs-2': 'utf-16le',
  'latin1': 'latin1',
  'binary': 'latin1',
  'ascii': 'ascii',
};

function normalize(encoding) {
  const name = String(encoding || 'utf-8').toLowerCase().trim();
  return ALIASES[name] || null;
}

function encodingExists(encoding) {
  return normalize(encoding) !== null;
}

function decode(buffer, encoding) {
  return Buffer.from(buffer).toString(normalize(encoding) || 'utf-8');
}

function encode(str, encoding) {
  return Buffer.from(String(str), normalize(encoding) || 'utf-8');
}

function decodeStream(encoding) {
  const target = normalize(encoding) || 'utf-8';
  return new Transform({
    transform(chunk, _enc, callback) {
      callback(null, Buffer.from(chunk).toString(target));
    },
  });
}

function encodeStream(encoding) {
  const target = normalize(encoding) || 'utf-8';
  return new Transform({
    transform(chunk, _enc, callback) {
      callback(null, Buffer.from(String(chunk), target));
    },
  });
}

function getDecoder(encoding) {
  return {
    write: (chunk) => decode(chunk, encoding),
    end: () => '',
  };
}

function getEncoder(encoding) {
  return {
    write: (chunk) => encode(chunk, encoding),
    end: () => Buffer.alloc(0),
  };
}

module.exports = {
  encodingExists,
  decode,
  encode,
  decodeStream,
  encodeStream,
  getDecoder,
  getEncoder,
  defaultCharUnicode: '\ufffd',
  defaultCharSingleByte: '?',
};
