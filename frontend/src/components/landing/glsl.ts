/**
 * The shader pieces the landing page's light effects share, so HorizonArc's planet rim and the build orbit's ray are
 * painted with literally the same colour ramp and read as one light.
 *
 * Handles: the full-screen-quad vertex shader, the colour ramp the page's lights are painted with, and compiling and
 * linking a program from a vertex and fragment source, returning null on any failure so the caller can fall back to
 * something that needs no WebGL.
 *
 * The ramp runs black through deep ember and orange to gold, a pale-yellow edge and a white core - the order a hot
 * disk really glows in. It was a purple-to-lavender ramp after the owner's planet-rim reference until the owner asked
 * for the whole app in gold; an indigo-to-lavender ramp after reflect.app and a copper one came before that. It takes
 * a level that already carries brightness - near-black at 0, near-white at 1. The hero's black hole used it too, with
 * a value-noise and fbm snippet and a gentler glowColour() entry point for its card-edge band; both went with the
 * hole on 2026-10-03, when HeroNebula replaced it (the nebula and the footer's FooterHole carry their own noise and
 * colour).
 *
 * There is a second ramp, the gold one, for the home page's orbit and the comet that lights it (StepOrbit, comet.ts).
 * It keeps to the hue of the app's own gold all the way down - bronze, amber, gold, pale gold, white - where the
 * first runs through red-orange ember on the way. The owner asked why the light on the planet's rim was orange when
 * the comet that made it was yellow: the two were painted from different colours. So both of their shaders take
 * this one ramp, written out from a single list of stops (GOLD_STOPS).
 */
export const FULLSCREEN_VERTEX = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

export const RAMP_GLSL = `
vec3 ramp(float g) {
  vec3 col = mix(vec3(0.0), vec3(0.10, 0.03, 0.008), clamp(g / 0.06, 0.0, 1.0));
  col = mix(col, vec3(0.36, 0.10, 0.015), clamp((g - 0.06) / 0.14, 0.0, 1.0));
  col = mix(col, vec3(0.74, 0.27, 0.03), clamp((g - 0.2) / 0.18, 0.0, 1.0));
  col = mix(col, vec3(0.98, 0.48, 0.08), clamp((g - 0.38) / 0.17, 0.0, 1.0));
  col = mix(col, vec3(1.0, 0.70, 0.26), clamp((g - 0.55) / 0.15, 0.0, 1.0));
  col = mix(col, vec3(1.0, 0.86, 0.56), clamp((g - 0.7) / 0.12, 0.0, 1.0));
  col = mix(col, vec3(1.0, 0.95, 0.82), clamp((g - 0.82) / 0.1, 0.0, 1.0));
  return mix(col, vec3(1.0, 0.99, 0.95), clamp((g - 0.92) / 0.08, 0.0, 1.0));
}
`;

const GOLD_STOPS: [number, number, number, number][] = [
  [0, 0, 0, 0],
  [0.06, 0.085, 0.05, 0.012],
  [0.2, 0.3, 0.175, 0.035],
  [0.38, 0.66, 0.42, 0.085],
  [0.55, 0.93, 0.66, 0.19],
  [0.7, 1, 0.8, 0.38],
  [0.82, 1, 0.9, 0.62],
  [0.92, 1, 0.96, 0.84],
  [1, 1, 0.99, 0.95],
];

const glsl = (value: number) => value.toFixed(3);

export const GOLD_RAMP_GLSL = `
vec3 ramp(float g) {
  vec3 col = vec3(0.0);
${GOLD_STOPS.slice(1)
  .map(([level, red, green, blue], index) => {
    const from = GOLD_STOPS[index][0];
    return `  col = mix(col, vec3(${glsl(red)}, ${glsl(green)}, ${glsl(blue)}), clamp((g - ${glsl(from)}) / ${glsl(level - from)}, 0.0, 1.0));`;
  })
  .join("\n")}
  return col;
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
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

export function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const dispose = () => {
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.deleteBuffer(buffer);
  };
  return { program, dispose };
}
