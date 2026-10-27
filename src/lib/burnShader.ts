/**
 * The fire that crosses the slide, as a WebGL shader.
 *
 * This is the reference's idea — a burn carved out of fractal noise, with a white-hot
 * edge along the carve and a time-driven flicker — with two changes that matter for a
 * slide transition:
 *
 *   - the front sweeps from left to right (`u_front`) instead of rising, so it matches
 *     the direction the stylesheet dissolves the outgoing slide in;
 *   - it is only ever the *fire*. What hides the old slide is the CSS mask, which the
 *     same noise is baked into, so the two stay on the same ragged front and the shader
 *     never has to see the slide's pixels.
 *
 * Everything here is plain TypeScript with no React and no DOM beyond a canvas, and
 * `createBurnRenderer` hands back `null` when WebGL is not available, so the caller can
 * fall back to the CSS fire instead of losing the transition.
 */

export const BURN_VERTEX_SHADER = `
precision mediump float;

varying vec2 vUv;
attribute vec2 a_position;

void main() {
  vUv = a_position;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const BURN_FRAGMENT_SHADER = `
precision mediump float;

varying vec2 vUv;
uniform vec2 u_resolution;
uniform float u_progress;
uniform float u_time;
uniform float u_front;
uniform float u_aspect;

float rand(vec2 n) {
  return fract(cos(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float noise(vec2 n) {
  const vec2 d = vec2(0.0, 1.0);
  vec2 b = floor(n), f = smoothstep(vec2(0.0), vec2(1.0), fract(n));
  return mix(mix(rand(b), rand(b + d.yx), f.x), mix(rand(b + d.xy), rand(b + d.yy), f.x), f.y);
}

float fbm(vec2 n) {
  float total = 0.0, amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    total += noise(n) * amplitude;
    n += n;
    amplitude *= 0.6;
  }
  return total;
}

void main() {
  vec2 uv = vUv * 0.5 + 0.5;
  uv.y = 1.0 - uv.y;
  // Square the noise up against the *slide's* shape, not this canvas's: the canvas is a
  // narrow band, and using its aspect would stretch every flame into a streak.
  vec2 noiseUv = vec2(uv.x * u_aspect, uv.y);

  // The front wanders as it crosses: noise in space, moving slowly in time.
  float wander = fbm(vec2(noiseUv.y * 2.4, 8.0) - vec2(0.0, 0.03 * u_time));
  float front = u_front + (wander - 0.5) * 0.12;
  float distanceToFront = uv.x - front;

  // Fire: fractal noise in the flame colours, flickering upward.
  vec3 fireColor = fbm(noiseUv * 9.0 - vec2(0.0, 0.02 * u_time)) * vec3(6.0, 1.6, 0.0);
  float flames = smoothstep(0.35, 0.95, fbm(noiseUv * 18.0 + vec2(2.0, -0.03 * u_time)));
  float glow = smoothstep(0.6, 0.9, fbm(noiseUv * 2.2 + vec2(5.0, 0.0)));

  // The band: a narrow flame body with a white-hot core right on the line.
  float band = 0.012 + 0.022 * flames + 0.012 * glow;
  float edge = smoothstep(-band, 0.0, distanceToFront) * (1.0 - smoothstep(0.0, band * 2.2, distanceToFront));
  float core = exp(-abs(distanceToFront) * 110.0);
  float halo = exp(-abs(distanceToFront) * 11.0) * 0.5;

  vec3 color = fireColor * edge * 0.75 + vec3(1.0, 0.93, 0.76) * core * 1.1 + vec3(1.0, 0.7, 0.35) * halo * 0.5;
  float alpha = clamp(edge * 0.95 + core + halo * 0.5, 0.0, 1.0);
  // Nothing is drawn before the burn starts or once it is over.
  alpha *= smoothstep(0.0, 0.06, u_progress) * (1.0 - smoothstep(0.94, 1.0, u_progress));

  gl_FragColor = vec4(color, alpha);
}
`;


/** What a renderer needs to draw one frame. */
export interface BurnFrame {
  /** 0 = nothing burnt, 1 = the slide has gone. */
  readonly progress: number;
  /** Milliseconds since the burn started, for the flicker. */
  readonly time: number;
  /** The *slide's* width ÷ height, so the noise is not stretched by a narrow canvas. */
  readonly aspect?: number;
}

export interface BurnRenderer {
  /** Match the drawing buffer to the element's size, in device pixels. */
  resize(width: number, height: number): void;
  draw(frame: BurnFrame): void;
  dispose(): void;
}

export interface BurnShaderInfo {
  readonly uniforms: readonly string[];
  readonly attributes: readonly string[];
}

/** What the shader expects to be fed, for tests and for anyone reading this later. */
export const BURN_SHADER_INFO: BurnShaderInfo = {
  uniforms: ['u_resolution', 'u_progress', 'u_time', 'u_front', 'u_aspect'],
  attributes: ['a_position'],
};

/**
 * How far the front has crossed, in 0–1.
 *
 * The stylesheet sweeps the mask linearly, so the shader is handed the same linear
 * progress: if either eased, the two would drift apart and the fire would slide off the
 * burnt edge.
 */
export function burnProgress(elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}

/**
 * Where the front is across the slide, in the shader's 0–1 space.
 *
 * The band is a little wider than the visible slide, so it sweeps in from just off the
 * left edge and out past the right one rather than appearing in place.
 */
export function burnFront(progress: number, overscan = 0.12): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return -overscan + clamped * (1 + overscan * 2);
}

function compile(gl: WebGLRenderingContext, source: string, type: number): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Build a renderer for one canvas, or `null` if this browser cannot give us WebGL.
 * The caller keeps the canvas either way: with `null` it shows the CSS fire instead.
 */
export function createBurnRenderer(canvas: HTMLCanvasElement | null | undefined): BurnRenderer | null {
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  const gl = (canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false }) ||
    canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
  if (!gl) return null;

  const vertexShader = compile(gl, BURN_VERTEX_SHADER, gl.VERTEX_SHADER);
  const fragmentShader = compile(gl, BURN_FRAGMENT_SHADER, gl.FRAGMENT_SHADER);
  if (!vertexShader || !fragmentShader) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    progress: gl.getUniformLocation(program, 'u_progress'),
    time: gl.getUniformLocation(program, 'u_time'),
    front: gl.getUniformLocation(program, 'u_front'),
    aspect: gl.getUniformLocation(program, 'u_aspect'),
  };

  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.viewport(0, 0, canvas.width, canvas.height);

  return {
    resize(width, height) {
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    },
    draw({ progress, time, aspect }) {
      const clamped = Math.min(1, Math.max(0, progress));
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.progress, clamped);
      gl.uniform1f(uniforms.time, time);
      gl.uniform1f(uniforms.front, burnFront(clamped));
      gl.uniform1f(uniforms.aspect, Math.min(4, Math.max(0.25, aspect || 16 / 9)));
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      // Hand the context back: a browser only allows a handful at once, and a deck can
      // play this transition on every slide.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
