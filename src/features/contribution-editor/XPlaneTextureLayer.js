const WEBGL1_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texture;
uniform mat4 u_matrix;
uniform vec4 u_origin_clip;
uniform float u_world_size;
varying highp vec2 v_texture;

void main() {
  gl_Position = u_origin_clip + u_matrix * vec4(a_position * u_world_size, 0.0, 0.0);
  v_texture = a_texture;
}`;

const WEBGL1_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D u_texture;
uniform float u_opacity;
uniform float u_flip_v;
uniform float u_marking_emphasis;
uniform float u_texture_lod_bias;
varying highp vec2 v_texture;

void main() {
  vec2 texture_position = vec2(v_texture.x, mix(v_texture.y, 1.0 - v_texture.y, u_flip_v));
  vec4 color = texture2D(u_texture, texture_position, u_texture_lod_bias);
  vec3 straight_color = color.a > 0.0001 ? color.rgb / color.a : vec3(0.0);
  float luminance = dot(straight_color, vec3(0.2126, 0.7152, 0.0722));
  vec3 emphasized = mix(vec3(luminance), straight_color, 1.0 + 0.28 * u_marking_emphasis);
  emphasized = min(vec3(1.0), emphasized * (1.0 + 0.16 * u_marking_emphasis));
  float alpha = min(1.0, color.a * (1.0 + 0.12 * u_marking_emphasis));
  gl_FragColor = vec4(emphasized * alpha * u_opacity, alpha * u_opacity);
}`;

const WEBGL2_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_texture;
uniform mat4 u_matrix;
uniform vec4 u_origin_clip;
uniform float u_world_size;
out highp vec2 v_texture;

void main() {
  gl_Position = u_origin_clip + u_matrix * vec4(a_position * u_world_size, 0.0, 0.0);
  v_texture = a_texture;
}`;

const WEBGL2_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform float u_opacity;
uniform float u_flip_v;
uniform float u_marking_emphasis;
uniform float u_texture_lod_bias;
in highp vec2 v_texture;
out vec4 fragment_color;

void main() {
  vec2 texture_position = vec2(v_texture.x, mix(v_texture.y, 1.0 - v_texture.y, u_flip_v));
  vec4 color = texture(u_texture, texture_position, u_texture_lod_bias);
  vec3 straight_color = color.a > 0.0001 ? color.rgb / color.a : vec3(0.0);
  float luminance = dot(straight_color, vec3(0.2126, 0.7152, 0.0722));
  vec3 emphasized = mix(vec3(luminance), straight_color, 1.0 + 0.28 * u_marking_emphasis);
  emphasized = min(vec3(1.0), emphasized * (1.0 + 0.16 * u_marking_emphasis));
  float alpha = min(1.0, color.a * (1.0 + 0.12 * u_marking_emphasis));
  fragment_color = vec4(emphasized * alpha * u_opacity, alpha * u_opacity);
}`;

const PREMULTIPLIED_IMAGES = new WeakSet();
const PAVEMENT_MIP_BIAS = 0.45;

export class XPlaneTextureLayer {
  type = 'custom';
  renderingMode = '2d';

  constructor(onStats, { id = 'xplane-world-textures', textureSources } = {}) {
    this.id = id;
    this.map = null;
    this.gl = null;
    this.program = null;
    this.groups = [];
    this.groupPatterns = new Set();
    this.buffers = new Map();
    this.textures = new Map();
    // Keep the decoded source pixels for the lifetime of the layer. MapLibre can
    // rebuild its style/WebGL resources without the scenery upload changing, so
    // deleting the only CPU-side copy after the first upload makes textures
    // disappear until the user reconnects the scenery folder.
    this.textureSources = textureSources ?? new Map();
    this.opacity = 1;
    this.onStats = onStats;
    this.lastDrawnGroups = 0;
    this.lastDrawnTriangles = 0;
    this.lastStatsSignature = '';
  }

  setGeometry(groups) {
    this.groups = groups ?? [];
    this.groupPatterns = new Set(this.groups.map((group) => group.pattern));
    this.lastDrawnGroups = 0;
    this.lastDrawnTriangles = 0;
    if (this.gl) {
      this.rebuildBuffers();
      this.removeUnusedTextures();
      for (const pattern of this.groupPatterns) this.uploadTexture(pattern);
    }
    this.reportStats();
    this.map?.triggerRepaint();
  }

  setTexture(pattern, image, { wrap = true, lineTexture = false } = {}) {
    if (!pattern || !image) return;
    premultiplyImageAlpha(image);
    this.textureSources.set(pattern, { image, wrap, lineTexture });
    if (this.gl && this.groupPatterns.has(pattern)) this.uploadTexture(pattern);
    this.reportStats();
    this.map?.triggerRepaint();
  }

  setOpacity(opacity) {
    this.opacity = Math.min(1, Math.max(0, Number(opacity) || 0));
    this.map?.triggerRepaint();
  }

  onAdd(map, gl) {
    this.map = map;
    this.gl = gl;
    this.anisotropy = textureAnisotropy(gl);
    const webGl2 = isWebGl2Context(gl);
    this.program = createProgram(
      gl,
      webGl2 ? WEBGL2_VERTEX_SHADER : WEBGL1_VERTEX_SHADER,
      webGl2 ? WEBGL2_FRAGMENT_SHADER : WEBGL1_FRAGMENT_SHADER
    );
    this.locations = {
      position: gl.getAttribLocation(this.program, 'a_position'),
      texture: gl.getAttribLocation(this.program, 'a_texture'),
      matrix: gl.getUniformLocation(this.program, 'u_matrix'),
      originClip: gl.getUniformLocation(this.program, 'u_origin_clip'),
      worldSize: gl.getUniformLocation(this.program, 'u_world_size'),
      sampler: gl.getUniformLocation(this.program, 'u_texture'),
      opacity: gl.getUniformLocation(this.program, 'u_opacity'),
      flipV: gl.getUniformLocation(this.program, 'u_flip_v'),
      markingEmphasis: gl.getUniformLocation(this.program, 'u_marking_emphasis'),
      textureLodBias: gl.getUniformLocation(this.program, 'u_texture_lod_bias'),
    };
    this.rebuildBuffers();
    for (const pattern of this.groupPatterns) this.uploadTexture(pattern);
    this.reportStats();
  }

  render(gl, options) {
    if (!this.program || this.opacity <= 0) return;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.locations.matrix, false, options.modelViewProjectionMatrix);
    gl.uniform1i(this.locations.sampler, 0);
    gl.uniform1f(this.locations.opacity, this.opacity);
    const worldSize = Number(this.map?.transform?.worldSize) || 1;
    gl.uniform1f(this.locations.worldSize, worldSize);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    let drawnGroups = 0;
    let drawnTriangles = 0;
    for (const group of this.groups) {
      const buffer = this.buffers.get(group.id ?? group.pattern);
      const texture = this.textures.get(group.pattern);
      if (!buffer || !texture) continue;
      const originClip = transformOrigin(
        options.modelViewProjectionMatrix,
        group.origin,
        worldSize
      );
      gl.uniform4f(
        this.locations.originClip,
        originClip[0],
        originClip[1],
        originClip[2],
        originClip[3]
      );
      gl.uniform1f(this.locations.flipV, group.lineTexture ? 0 : 1);
      gl.uniform1f(
        this.locations.markingEmphasis,
        group.markingTexture || group.lineTexture ? 1 : 0
      );
      gl.uniform1f(
        this.locations.textureLodBias,
        group.markingTexture || group.lineTexture ? 0 : PAVEMENT_MIP_BIAS
      );
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(this.locations.position);
      gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(this.locations.texture);
      gl.vertexAttribPointer(this.locations.texture, 2, gl.FLOAT, false, 16, 8);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.drawArrays(gl.TRIANGLES, 0, group.vertices.length / 4);
      drawnGroups += 1;
      drawnTriangles += group.vertices.length / 12;
    }
    gl.disableVertexAttribArray(this.locations.position);
    gl.disableVertexAttribArray(this.locations.texture);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.depthMask(true);
    if (drawnGroups !== this.lastDrawnGroups || drawnTriangles !== this.lastDrawnTriangles) {
      this.lastDrawnGroups = drawnGroups;
      this.lastDrawnTriangles = drawnTriangles;
      this.reportStats();
    }
  }

  onRemove(_map, gl) {
    for (const buffer of this.buffers.values()) gl.deleteBuffer(buffer);
    for (const texture of this.textures.values()) gl.deleteTexture(texture);
    if (this.program) gl.deleteProgram(this.program);
    this.buffers.clear();
    this.textures.clear();
    this.gl = null;
    this.map = null;
    this.program = null;
  }

  getStats() {
    const drawableGroups = this.groups.filter((group) =>
      this.textureSources.has(group.pattern)
    ).length;
    return {
      meshGroups: this.groups.length,
      drawableGroups,
      drawnGroups: this.lastDrawnGroups,
      drawnTriangles: this.lastDrawnTriangles,
    };
  }

  reportStats() {
    const stats = this.getStats();
    const signature = JSON.stringify(stats);
    if (signature === this.lastStatsSignature) return;
    this.lastStatsSignature = signature;
    this.onStats?.(stats);
  }

  rebuildBuffers() {
    const gl = this.gl;
    if (!gl) return;
    for (const buffer of this.buffers.values()) gl.deleteBuffer(buffer);
    this.buffers.clear();
    for (const group of this.groups) {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, group.vertices, gl.STATIC_DRAW);
      this.buffers.set(group.id ?? group.pattern, buffer);
    }
  }

  uploadTexture(pattern) {
    const gl = this.gl;
    const source = this.textureSources.get(pattern);
    if (!gl || !source) return;
    const previous = this.textures.get(pattern);
    if (previous) gl.deleteTexture(previous);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !source.image.data);
    if (source.image.data) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        source.image.width,
        source.image.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source.image.data
      );
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source.image);
    }
    const supportsNpot = isWebGl2Context(gl);
    const powerOfTwo = isPowerOfTwo(source.image.width) && isPowerOfTwo(source.image.height);
    const canRepeat = supportsNpot || powerOfTwo;
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      canRepeat ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_S,
      source.wrap && canRepeat ? gl.REPEAT : gl.CLAMP_TO_EDGE
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_T,
      source.wrap && !source.lineTexture && canRepeat ? gl.REPEAT : gl.CLAMP_TO_EDGE
    );
    if (canRepeat) gl.generateMipmap(gl.TEXTURE_2D);
    if (canRepeat && this.anisotropy) {
      gl.texParameterf(
        gl.TEXTURE_2D,
        this.anisotropy.extension.TEXTURE_MAX_ANISOTROPY_EXT,
        this.anisotropy.maximum
      );
    }
    this.textures.set(pattern, texture);
  }

  removeUnusedTextures() {
    const gl = this.gl;
    if (!gl) return;
    for (const [pattern, texture] of this.textures) {
      if (this.groupPatterns.has(pattern)) continue;
      gl.deleteTexture(texture);
      this.textures.delete(pattern);
    }
  }
}

function isPowerOfTwo(value) {
  return value > 0 && (value & (value - 1)) === 0;
}

function premultiplyImageAlpha(image) {
  if (!image?.data || PREMULTIPLIED_IMAGES.has(image)) return;
  const pixels = image.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] / 255;
    pixels[index] = Math.round(pixels[index] * alpha);
    pixels[index + 1] = Math.round(pixels[index + 1] * alpha);
    pixels[index + 2] = Math.round(pixels[index + 2] * alpha);
  }
  PREMULTIPLIED_IMAGES.add(image);
}

function textureAnisotropy(gl) {
  const extension =
    gl.getExtension?.('EXT_texture_filter_anisotropic') ||
    gl.getExtension?.('WEBKIT_EXT_texture_filter_anisotropic') ||
    gl.getExtension?.('MOZ_EXT_texture_filter_anisotropic');
  if (!extension) return null;
  const supported = Number(gl.getParameter?.(extension.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) || 1;
  return {
    extension,
    maximum: Math.max(1, Math.min(8, supported)),
  };
}

function isWebGl2Context(gl) {
  return typeof gl?.texStorage2D === 'function';
}

export function transformOrigin(matrix, origin = [0, 0], worldSize = 1) {
  const scale = Number(worldSize) || 1;
  const x = (Number(origin[0]) || 0) * scale;
  const y = (Number(origin[1]) || 0) * scale;
  return [
    matrix[0] * x + matrix[4] * y + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[14],
    matrix[3] * x + matrix[7] * y + matrix[15],
  ];
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unable to link X-Plane texture shader.';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unable to compile X-Plane texture shader.';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}
