import assert from 'node:assert/strict';
import test from 'node:test';
import { XPlaneTextureLayer, transformOrigin } from './XPlaneTextureLayer.js';

test('transforms a relative mesh origin in double precision before GPU upload', () => {
  const matrix = [2, 0, 0, 0, 0, -3, 0, 0, 0, 0, 1, 0, -1, 1, 0, 1];

  assert.deepEqual(transformOrigin(matrix, [0.75, 0.25]), [0.5, 0.25, 0, 1]);
  assert.deepEqual(transformOrigin(matrix, [0.75, 0.25], 512), [767, -383, 0, 1]);
});

test('uploads and draws an origin-relative texture mesh through WebGL2', () => {
  const gl = fakeWebGl2();
  const reports = [];
  const layer = new XPlaneTextureLayer((stats) => reports.push(stats));
  layer.setGeometry([
    {
      pattern: 'pavement',
      origin: [0.75, 0.25],
      lineTexture: false,
      vertices: new Float32Array([0, 0, 0, 0, 0.000_001, 0, 1, 0, 0, 0.000_001, 0, 1]),
    },
  ]);
  layer.setTexture('pavement', {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray(16).fill(255),
  });
  layer.onAdd({ transform: { worldSize: 512 }, triggerRepaint() {} }, gl);
  layer.render(gl, {
    modelViewProjectionMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  });

  assert.ok(gl.shaderSources.every((source) => source.startsWith('#version 300 es')));
  assert.deepEqual(gl.drawCalls, [{ mode: gl.TRIANGLES, first: 0, count: 3 }]);
  assert.deepEqual(gl.originClipCalls, [[384, 128, 0, 1]]);
  assert.deepEqual(gl.anisotropyCalls, [[gl.TEXTURE_2D, 0x84fe, 8]]);
  assert.deepEqual(gl.blendCalls, [
    [gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA],
  ]);
  assert.deepEqual(gl.uniformFloatCalls.get('u_marking_emphasis'), [0]);
  assert.deepEqual(gl.uniformFloatCalls.get('u_texture_lod_bias'), [0.45]);
  assert.deepEqual(reports.at(-1), {
    meshGroups: 1,
    drawableGroups: 1,
    drawnGroups: 1,
    drawnTriangles: 1,
  });
});

test('premultiplies translucent texture pixels exactly once before mipmapping', () => {
  const layer = new XPlaneTextureLayer();
  const image = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([200, 100, 50, 128]),
  };

  layer.setTexture('marking', image, { lineTexture: true });
  layer.setTexture('marking', image, { lineTexture: true });

  assert.deepEqual([...image.data], [100, 50, 25, 128]);
});

test('shares decoded pixels while uploading only textures used by each render pass', () => {
  const shared = new Map();
  const terrain = new XPlaneTextureLayer(undefined, {
    id: 'terrain-pass',
    textureSources: shared,
  });
  const overlay = new XPlaneTextureLayer(undefined, {
    id: 'overlay-pass',
    textureSources: shared,
  });
  terrain.setGeometry([{ pattern: 'grass', vertices: new Float32Array() }]);
  overlay.setGeometry([{ pattern: 'marking', vertices: new Float32Array() }]);
  const image = { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) };

  terrain.setTexture('grass', image);
  overlay.setTexture('grass', image);

  assert.equal(terrain.id, 'terrain-pass');
  assert.equal(overlay.id, 'overlay-pass');
  assert.equal(shared.size, 1);
  assert.equal(terrain.getStats().drawableGroups, 1);
  assert.equal(overlay.getStats().drawableGroups, 0);
});

function fakeWebGl2() {
  let nextObject = 0;
  const shaderSources = [];
  const drawCalls = [];
  const originClipCalls = [];
  const anisotropyCalls = [];
  const blendCalls = [];
  const uniformFloatCalls = new Map();
  const anisotropy = {
    TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe,
    MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff,
  };
  return {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TEXTURE0: 0x84c0,
    TEXTURE_2D: 0x0de1,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    LINEAR: 0x2601,
    REPEAT: 0x2901,
    CLAMP_TO_EDGE: 0x812f,
    UNPACK_ALIGNMENT: 0x0cf5,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    BLEND: 0x0be2,
    DEPTH_TEST: 0x0b71,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    ONE: 1,
    TRIANGLES: 4,
    shaderSources,
    drawCalls,
    originClipCalls,
    anisotropyCalls,
    blendCalls,
    uniformFloatCalls,
    getExtension(name) {
      return name === 'EXT_texture_filter_anisotropic' ? anisotropy : null;
    },
    getParameter(parameter) {
      return parameter === anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT ? 16 : 0;
    },
    texStorage2D() {},
    createShader(type) {
      return { id: ++nextObject, type };
    },
    shaderSource(shader, source) {
      shader.source = source;
      shaderSources.push(source);
    },
    compileShader() {},
    getShaderParameter() {
      return true;
    },
    getShaderInfoLog() {
      return '';
    },
    deleteShader() {},
    createProgram() {
      return { id: ++nextObject };
    },
    attachShader() {},
    linkProgram() {},
    getProgramParameter() {
      return true;
    },
    getProgramInfoLog() {
      return '';
    },
    deleteProgram() {},
    getAttribLocation(_program, name) {
      return name === 'a_position' ? 0 : 1;
    },
    getUniformLocation(_program, name) {
      return name;
    },
    createBuffer() {
      return { id: ++nextObject };
    },
    deleteBuffer() {},
    bindBuffer() {},
    bufferData() {},
    createTexture() {
      return { id: ++nextObject };
    },
    deleteTexture() {},
    bindTexture() {},
    pixelStorei() {},
    texImage2D() {},
    texParameteri() {},
    texParameterf(...values) {
      anisotropyCalls.push(values);
    },
    generateMipmap() {},
    useProgram() {},
    uniformMatrix4fv() {},
    uniform1i() {},
    uniform1f(location, value) {
      const calls = uniformFloatCalls.get(location) ?? [];
      calls.push(value);
      uniformFloatCalls.set(location, calls);
    },
    uniform4f(location, ...values) {
      if (location === 'u_origin_clip') originClipCalls.push(values);
    },
    activeTexture() {},
    enable() {},
    disable() {},
    depthMask() {},
    blendFuncSeparate(...values) {
      blendCalls.push(values);
    },
    enableVertexAttribArray() {},
    disableVertexAttribArray() {},
    vertexAttribPointer() {},
    drawArrays(mode, first, count) {
      drawCalls.push({ mode, first, count });
    },
  };
}
