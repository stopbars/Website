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
const STATS_IDLE_DELAY_MS = 180;
const TEXTURE_FLUSH_IDLE_DELAY_MS = 180;

export class SimulatorTextureLayer {
  type = 'custom';
  renderingMode = '2d';

  constructor(onStats, { id = 'xplane-world-textures', textureSources } = {}) {
    this.id = id;
    this.map = null;
    this.gl = null;
    this.program = null;
    this.groups = [];
    this.groupPatterns = new Set();
    this.buffer = null;
    this.drawRanges = new Map();
    this.textures = new Map();
    this.pendingTexturePatterns = new Set();
    // Keep the decoded source pixels for the lifetime of the layer. MapLibre can
    // rebuild its style/WebGL resources without the scenery upload changing, so
    // deleting the only CPU-side copy after the first upload makes textures
    // disappear until the user reconnects the scenery folder.
    this.textureSources = textureSources ?? new Map();
    this.opacity = 1;
    this.groupVisibility = () => true;
    this.onStats = onStats;
    this.lastDrawnGroups = 0;
    this.lastDrawnTriangles = 0;
    this.lastStatsSignature = '';
    this.statsTimer = null;
    this.textureFlushTimer = null;
    this.pointerActive = false;
    this.handleMoveStart = null;
    this.handleMoveEnd = null;
    this.handlePointerDown = null;
    this.handlePointerUp = null;
  }

  setGeometry(groups) {
    const ids = new Set();
    for (const group of groups ?? []) {
      const id = group.id ?? group.pattern;
      if (ids.has(id)) throw new Error(`Duplicate render-group id: ${id}`);
      ids.add(id);
    }
    this.groups = groups ?? [];
    this.groupPatterns = new Set(this.groups.map((group) => group.pattern));
    this.lastDrawnGroups = 0;
    this.lastDrawnTriangles = 0;
    if (this.gl) {
      this.rebuildBuffers();
      this.removeUnusedTextures();
      for (const pattern of this.groupPatterns) this.uploadTexture(pattern);
    }
    this.scheduleStats();
    this.map?.triggerRepaint();
  }

  setTexture(pattern, image, { wrap = true, lineTexture = false } = {}) {
    if (!pattern || !image) return;
    premultiplyImageAlpha(image);
    this.textureSources.set(pattern, { image, wrap, lineTexture });
    if (this.gl && this.groupPatterns.has(pattern)) this.uploadTexture(pattern);
    this.scheduleStats();
    this.map?.triggerRepaint();
  }

  setOpacity(opacity) {
    this.opacity = Math.min(1, Math.max(0, Number(opacity) || 0));
    this.map?.triggerRepaint();
  }

  setGroupVisibility(predicate) {
    this.groupVisibility = typeof predicate === 'function' ? predicate : () => true;
    this.lastDrawnGroups = 0;
    this.lastDrawnTriangles = 0;
    this.reportStats();
    this.map?.triggerRepaint();
  }

  onAdd(map, gl) {
    this.map = map;
    this.gl = gl;
    this.handleMoveStart = () => {
      this.cancelScheduledStats();
      this.cancelScheduledTextureFlush();
    };
    this.handleMoveEnd = () => {
      this.scheduleTextureFlush();
      this.scheduleStats();
    };
    this.handlePointerDown = () => {
      this.pointerActive = true;
      this.cancelScheduledStats();
      this.cancelScheduledTextureFlush();
    };
    this.handlePointerUp = () => {
      this.pointerActive = false;
      this.scheduleTextureFlush();
      this.scheduleStats();
    };
    map.on?.('movestart', this.handleMoveStart);
    map.on?.('moveend', this.handleMoveEnd);
    map.on?.('mousedown', this.handlePointerDown);
    map.on?.('touchstart', this.handlePointerDown);
    map.on?.('mouseup', this.handlePointerUp);
    map.on?.('touchend', this.handlePointerUp);
    map.on?.('touchcancel', this.handlePointerUp);
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
    if (!this.program || this.opacity <= 0 || !this.buffer) return;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.locations.matrix, false, options.modelViewProjectionMatrix);
    gl.uniform1i(this.locations.sampler, 0);
    const worldSize = Number(this.map?.transform?.worldSize) || 1;
    gl.uniform1f(this.locations.worldSize, worldSize);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    let drawnGroups = 0;
    let drawnTriangles = 0;
    const viewportBounds = mercatorViewportBounds(this.map);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.locations.texture);
    gl.vertexAttribPointer(this.locations.texture, 2, gl.FLOAT, false, 16, 8);
    let boundTexture = null;
    let previousOpacity = NaN;
    let previousFlipV = NaN;
    let previousMarkingEmphasis = NaN;
    let previousTextureLodBias = NaN;
    for (const group of this.groups) {
      if (!this.groupVisibility(group)) continue;
      if (!boundsOverlap(group.mercatorBounds, viewportBounds)) continue;
      const drawRange = this.drawRanges.get(group.id ?? group.pattern);
      const texture = this.textures.get(group.pattern);
      if (!drawRange || !texture) continue;
      const opacity =
        this.opacity * Math.min(1, Math.max(0, Number(group.sourceOpacity ?? 1)));
      if (opacity !== previousOpacity) {
        gl.uniform1f(this.locations.opacity, opacity);
        previousOpacity = opacity;
      }
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
      const flipV = Number(group.flipV ?? (group.lineTexture ? 0 : 1));
      if (flipV !== previousFlipV) {
        gl.uniform1f(this.locations.flipV, flipV);
        previousFlipV = flipV;
      }
      const markingEmphasis = Number(
        group.markingEmphasis ?? (group.markingTexture || group.lineTexture ? 1 : 0)
      );
      if (markingEmphasis !== previousMarkingEmphasis) {
        gl.uniform1f(this.locations.markingEmphasis, markingEmphasis);
        previousMarkingEmphasis = markingEmphasis;
      }
      const textureLodBias = Number(
        group.textureLodBias ??
          (group.markingTexture || group.lineTexture ? 0 : PAVEMENT_MIP_BIAS)
      );
      if (textureLodBias !== previousTextureLodBias) {
        gl.uniform1f(this.locations.textureLodBias, textureLodBias);
        previousTextureLodBias = textureLodBias;
      }
      if (texture !== boundTexture) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        boundTexture = texture;
      }
      gl.drawArrays(gl.TRIANGLES, drawRange.first, drawRange.count);
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
      if (!this.map?.isMoving?.()) this.scheduleStats();
    }
  }

  onRemove(map, gl) {
    if (this.handleMoveStart) map.off?.('movestart', this.handleMoveStart);
    if (this.handleMoveEnd) map.off?.('moveend', this.handleMoveEnd);
    if (this.handlePointerDown) {
      map.off?.('mousedown', this.handlePointerDown);
      map.off?.('touchstart', this.handlePointerDown);
    }
    if (this.handlePointerUp) {
      map.off?.('mouseup', this.handlePointerUp);
      map.off?.('touchend', this.handlePointerUp);
      map.off?.('touchcancel', this.handlePointerUp);
    }
    this.cancelScheduledStats();
    this.cancelScheduledTextureFlush();
    if (this.buffer) gl.deleteBuffer(this.buffer);
    for (const texture of this.textures.values()) gl.deleteTexture(texture);
    if (this.program) gl.deleteProgram(this.program);
    this.buffer = null;
    this.drawRanges.clear();
    this.textures.clear();
    this.pendingTexturePatterns.clear();
    this.gl = null;
    this.map = null;
    this.program = null;
    this.pointerActive = false;
    this.handleMoveStart = null;
    this.handleMoveEnd = null;
    this.handlePointerDown = null;
    this.handlePointerUp = null;
  }

  getStats() {
    const drawableGroups = this.groups.filter(
      (group) => this.groupVisibility(group) && this.textureSources.has(group.pattern)
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

  scheduleStats() {
    if (!globalThis.window) {
      this.reportStats();
      return;
    }
    if (this.pointerActive || this.map?.isMoving?.()) return;
    if (this.statsTimer !== null) globalThis.clearTimeout(this.statsTimer);
    this.statsTimer = globalThis.setTimeout(() => {
      this.statsTimer = null;
      this.reportStats();
    }, STATS_IDLE_DELAY_MS);
  }

  cancelScheduledStats() {
    if (this.statsTimer === null) return;
    globalThis.clearTimeout(this.statsTimer);
    this.statsTimer = null;
  }

  scheduleTextureFlush() {
    if (this.pendingTexturePatterns.size === 0) return;
    if (this.pointerActive || this.map?.isMoving?.()) return;
    if (!globalThis.window) {
      this.flushPendingTextures();
      return;
    }
    this.cancelScheduledTextureFlush();
    this.textureFlushTimer = globalThis.setTimeout(() => {
      this.textureFlushTimer = null;
      if (!this.pointerActive && !this.map?.isMoving?.()) this.flushPendingTextures();
    }, TEXTURE_FLUSH_IDLE_DELAY_MS);
  }

  cancelScheduledTextureFlush() {
    if (this.textureFlushTimer === null) return;
    globalThis.clearTimeout(this.textureFlushTimer);
    this.textureFlushTimer = null;
  }

  rebuildBuffers() {
    const gl = this.gl;
    if (!gl) return;
    if (this.buffer) gl.deleteBuffer(this.buffer);
    this.buffer = null;
    this.drawRanges.clear();
    const valueCount = this.groups.reduce(
      (total, group) => total + (group.vertices?.length ?? 0),
      0
    );
    if (valueCount === 0) return;
    const vertices = new Float32Array(valueCount);
    let valueOffset = 0;
    for (const group of this.groups) {
      const groupVertices = group.vertices ?? [];
      vertices.set(groupVertices, valueOffset);
      this.drawRanges.set(group.id ?? group.pattern, {
        first: valueOffset / 4,
        count: groupVertices.length / 4,
      });
      valueOffset += groupVertices.length;
    }
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  }

  uploadTexture(pattern) {
    const gl = this.gl;
    const source = this.textureSources.get(pattern);
    if (!gl || !source) return;
    if (this.pointerActive || this.map?.isMoving?.()) {
      this.pendingTexturePatterns.add(pattern);
      return;
    }
    this.pendingTexturePatterns.delete(pattern);
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

  flushPendingTextures() {
    if (this.pendingTexturePatterns.size === 0) return;
    const patterns = [...this.pendingTexturePatterns];
    this.pendingTexturePatterns.clear();
    for (const pattern of patterns) this.uploadTexture(pattern);
    this.map?.triggerRepaint();
  }

  removeUnusedTextures() {
    const gl = this.gl;
    if (!gl) return;
    for (const [pattern, texture] of this.textures) {
      if (this.groupPatterns.has(pattern)) continue;
      gl.deleteTexture(texture);
      this.textures.delete(pattern);
      this.pendingTexturePatterns.delete(pattern);
    }
    for (const pattern of this.pendingTexturePatterns) {
      if (!this.groupPatterns.has(pattern)) this.pendingTexturePatterns.delete(pattern);
    }
  }
}

function boundsOverlap(groupBounds, viewportBounds) {
  if (!Array.isArray(groupBounds) || !Array.isArray(viewportBounds)) return true;
  return (
    groupBounds[2] >= viewportBounds[0] &&
    groupBounds[0] <= viewportBounds[2] &&
    groupBounds[3] >= viewportBounds[1] &&
    groupBounds[1] <= viewportBounds[3]
  );
}

function mercatorViewportBounds(map) {
  const bounds = map?.getBounds?.();
  if (!bounds) return null;
  const west = longitudeToMercatorX(bounds.getWest());
  const east = longitudeToMercatorX(bounds.getEast());
  const north = latitudeToMercatorY(bounds.getNorth());
  const south = latitudeToMercatorY(bounds.getSouth());
  const paddingX = Math.abs(east - west) * 0.05;
  const paddingY = Math.abs(south - north) * 0.05;
  return [west - paddingX, north - paddingY, east + paddingX, south + paddingY];
}

function longitudeToMercatorX(longitude) {
  return (Number(longitude) + 180) / 360;
}

function latitudeToMercatorY(latitude) {
  const clamped = Math.max(-85.051_129, Math.min(85.051_129, Number(latitude)));
  const radians = (clamped * Math.PI) / 180;
  return (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + radians / 2))) / 360;
}

function isPowerOfTwo(value) {
  return value > 0 && (value & (value - 1)) === 0;
}

function premultiplyImageAlpha(image) {
  if (!image?.data || image.premultiplied || PREMULTIPLIED_IMAGES.has(image)) return;
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
