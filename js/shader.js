/**
 * A-STEROIDS Dynamic Shader Visualization
 * TWIGL-inspired fragment shaders driven by game state
 * The shader evolves based on player actions
 */
window.ASteroids.Shader = (function () {
    let gl = null;
    let bgGl = null; // For the background overlay
    let program = null;
    let bgProgram = null;
    let canvas = null;
    let bgCanvas = null;
    let infoEl = null;
    let uniforms = {};
    let bgUniforms = {};
    let startTime = 0;
    let currentShaderIndex = 0;
    let initialized = false;

    // Game state uniforms
    const state = {
        shipX: 0.5,
        shipY: 0.5,
        shipVx: 0,
        shipVy: 0,
        shipAngle: 0,
        thrust: 0,
        score: 0,
        lives: 3,
        level: 1,
        explosionX: 0,
        explosionY: 0,
        explosionAge: 1.0,
        asteroidCount: 10,
        beat: 0,
        hyperspace: 0
    };

    // Vertex shader (simple fullscreen quad)
    const vertexShaderSource = `
        attribute vec2 a_position;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `;

    // Fragment shaders - each one is a different visual mode that evolves with gameplay
    const fragmentShaders = [
        // 0: Cosmic Warp - ship creates gravitational distortion
        {
            name: 'COSMIC WARP',
            desc: 'Gravitational lensing from ship movement',
            code: `
                precision highp float;
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform vec2 u_ship;
                uniform vec2 u_shipVel;
                uniform float u_angle;
                uniform float u_thrust;
                uniform float u_score;
                uniform float u_level;
                uniform vec2 u_explosion;
                uniform float u_explosionAge;
                uniform float u_beat;
                uniform float u_hyperspace;

                void main() {
                    vec2 uv = gl_FragCoord.xy / u_resolution;
                    vec2 p = uv * 2.0 - 1.0;
                    p.x *= u_resolution.x / u_resolution.y;

                    float t = u_time * 0.4;

                    // Ship gravitational influence
                    vec2 shipPos = u_ship * 2.0 - 1.0;
                    shipPos.x *= u_resolution.x / u_resolution.y;
                    vec2 toShip = p - shipPos;
                    float dist = length(toShip);

                    // Warp space around ship
                    float warp = u_thrust * 0.15 / (dist + 0.3);
                    p += normalize(toShip) * warp;

                    // Velocity trail
                    vec2 vel = u_shipVel * 0.5;
                    p += vel * 0.05 / (dist + 0.5);

                    // Explosion ripple
                    if (u_explosionAge < 1.0) {
                        vec2 expPos = u_explosion * 2.0 - 1.0;
                        expPos.x *= u_resolution.x / u_resolution.y;
                        float expDist = length(p - expPos);
                        float ripple = sin(expDist * 20.0 - u_explosionAge * 30.0) * (1.0 - u_explosionAge) * 0.1;
                        p += normalize(p - expPos + 0.001) * ripple;
                    }

                    // Hyperspace flash
                    float hyper = u_hyperspace * 2.0;

                    // Swirling pattern
                    float angle = atan(p.y, p.x);
                    float r = length(p);

                    float n = sin(angle * 3.0 + t + r * 5.0 - u_angle * 2.0)
                            * sin(r * 8.0 - t * 1.5 + u_score * 0.001)
                            * sin(angle * 5.0 - t * 0.7);

                    // Color based on game state
                    float levelMod = u_level * 0.1;
                    vec3 col = vec3(
                        sin(n * 3.14 + t + levelMod) * 0.5 + 0.5,
                        sin(n * 3.14 + t * 1.3 + 2.094 + u_angle) * 0.5 + 0.5,
                        sin(n * 3.14 + t * 0.7 + 4.188 + levelMod) * 0.5 + 0.5
                    );

                    // Beat pulse
                    col *= 0.7 + u_beat * 0.3;

                    // Thrust glow near ship
                    col += vec3(1.0, 0.4, 0.1) * u_thrust * 0.3 / (dist + 0.3);

                    // Hyperspace whiteout
                    col = mix(col, vec3(1.0), hyper);

                    // Vignette
                    col *= 1.0 - r * 0.3;

                    gl_FragColor = vec4(col, 1.0);
                }
            `
        },
        // 1: Fractal Nebula - evolving fractal driven by ship angle and score
        {
            name: 'FRACTAL NEBULA',
            desc: 'Fractal patterns shaped by your flight path',
            code: `
                precision highp float;
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform vec2 u_ship;
                uniform vec2 u_shipVel;
                uniform float u_angle;
                uniform float u_thrust;
                uniform float u_score;
                uniform float u_level;
                uniform vec2 u_explosion;
                uniform float u_explosionAge;
                uniform float u_beat;
                uniform float u_hyperspace;

                void main() {
                    vec2 uv = gl_FragCoord.xy / u_resolution;
                    vec2 p = uv * 2.0 - 1.0;
                    p.x *= u_resolution.x / u_resolution.y;

                    float t = u_time * 0.3;

                    // Apply ship influence to fractal seed
                    vec2 c = p * (1.5 + sin(t * 0.2) * 0.3);
                    c += u_ship * 0.5 - 0.25;
                    c += u_shipVel * 0.1;

                    // Julia set iteration
                    vec2 z = c;
                    vec2 seed = vec2(
                        sin(u_angle + t * 0.5) * 0.7 + cos(t * 0.3) * 0.1,
                        cos(u_angle - t * 0.3) * 0.7 + sin(t * 0.4) * 0.1
                    );

                    float iter = 0.0;
                    for (int i = 0; i < 32; i++) {
                        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + seed;
                        if (dot(z, z) > 4.0) break;
                        iter += 1.0;
                    }

                    float f = iter / 32.0;

                    // Color mapping
                    float levelTint = u_level * 0.15;
                    vec3 col = vec3(
                        sin(f * 6.28 + t + levelTint) * 0.5 + 0.5,
                        sin(f * 6.28 + t + 2.094) * 0.5 + 0.5,
                        sin(f * 6.28 + t * 0.5 + 4.188 + levelTint) * 0.5 + 0.5
                    );

                    // Explosion burst
                    if (u_explosionAge < 1.0) {
                        float d = length(uv - u_explosion);
                        col += vec3(1.0, 0.6, 0.2) * (1.0 - u_explosionAge) * 0.5 / (d + 0.2);
                    }

                    // Thrust energy
                    col += vec3(0.5, 0.2, 0.0) * u_thrust * f * 0.5;

                    col *= 0.8 + u_beat * 0.2;
                    col = mix(col, vec3(1.0), u_hyperspace * 2.0);

                    gl_FragColor = vec4(col, 1.0);
                }
            `
        },
        // 2: Plasma Pulse - classic plasma with explosion pulses
        {
            name: 'PLASMA PULSE',
            desc: 'Plasma waves modulated by explosions',
            code: `
                precision highp float;
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform vec2 u_ship;
                uniform vec2 u_shipVel;
                uniform float u_angle;
                uniform float u_thrust;
                uniform float u_score;
                uniform float u_level;
                uniform vec2 u_explosion;
                uniform float u_explosionAge;
                uniform float u_beat;
                uniform float u_hyperspace;

                void main() {
                    vec2 uv = gl_FragCoord.xy / u_resolution;
                    vec2 p = uv * 2.0 - 1.0;
                    p.x *= u_resolution.x / u_resolution.y;

                    float t = u_time;

                    // Ship-influenced plasma
                    float v1 = sin(p.x * 5.0 + t + u_ship.x * 3.14);
                    float v2 = sin(5.0 * (p.x * sin(t * 0.5 + u_angle) + p.y * cos(t * 0.3)) + t);
                    float v3 = sin(sqrt(pow(p.x + sin(t * 0.3) + u_shipVel.x, 2.0)
                               + pow(p.y + cos(t * 0.5) + u_shipVel.y, 2.0)) * 6.0 + t);

                    // Thrust wave
                    float v4 = sin(length(p - (u_ship * 2.0 - 1.0)) * (3.0 + u_thrust * 8.0) - t * 3.0);

                    float v = (v1 + v2 + v3 + v4 * u_thrust) * 0.25;

                    // Explosion pulse
                    if (u_explosionAge < 1.0) {
                        vec2 ep = u_explosion * 2.0 - 1.0;
                        ep.x *= u_resolution.x / u_resolution.y;
                        float d = length(p - ep);
                        float pulse = sin(d * 15.0 - u_explosionAge * 25.0) * (1.0 - u_explosionAge);
                        v += pulse * 0.5;
                    }

                    float levelShift = u_level * 0.2;
                    vec3 col = vec3(
                        sin(v * 3.14 + levelShift) * 0.5 + 0.5,
                        sin(v * 3.14 + 2.094 + u_angle * 0.5) * 0.5 + 0.5,
                        sin(v * 3.14 + 4.188 + levelShift * 2.0) * 0.5 + 0.5
                    );

                    col *= 0.7 + u_beat * 0.3;
                    col = mix(col, vec3(1.0), u_hyperspace * 2.0);

                    gl_FragColor = vec4(col, 1.0);
                }
            `
        },
        // 3: Wormhole - tunnel effect intensified by movement
        {
            name: 'WORMHOLE',
            desc: 'Hyperdimensional tunnel warped by velocity',
            code: `
                precision highp float;
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform vec2 u_ship;
                uniform vec2 u_shipVel;
                uniform float u_angle;
                uniform float u_thrust;
                uniform float u_score;
                uniform float u_level;
                uniform vec2 u_explosion;
                uniform float u_explosionAge;
                uniform float u_beat;
                uniform float u_hyperspace;

                void main() {
                    vec2 uv = gl_FragCoord.xy / u_resolution;
                    vec2 p = uv * 2.0 - 1.0;
                    p.x *= u_resolution.x / u_resolution.y;

                    float t = u_time;

                    // Center on ship
                    vec2 center = (u_ship * 2.0 - 1.0);
                    center.x *= u_resolution.x / u_resolution.y;
                    p -= center * 0.3;

                    // Polar coordinates
                    float r = length(p);
                    float a = atan(p.y, p.x);

                    // Tunnel effect
                    float tunnel = 1.0 / (r + 0.1);
                    float twist = a + tunnel * 0.5 + t * 0.5 + u_angle;

                    // Speed influences tunnel depth
                    float speed = length(u_shipVel);
                    tunnel *= 1.0 + speed * 0.3;

                    // Pattern
                    float pattern = sin(tunnel * 3.0 + twist * 3.0 + t)
                                  * sin(tunnel * 5.0 - twist * 2.0 + t * 1.5);

                    // Rings
                    float rings = sin(tunnel * 8.0 - t * 4.0 + u_thrust * 5.0) * 0.5 + 0.5;

                    float levelMod = u_level * 0.12;
                    vec3 col = vec3(
                        pattern * 0.5 + 0.5 + rings * 0.3,
                        sin(pattern * 3.14 + 2.094 + levelMod) * 0.5 + 0.5,
                        rings * 0.7 + pattern * 0.3 + levelMod
                    );

                    // Explosion flash
                    if (u_explosionAge < 1.0) {
                        col += vec3(1.0, 0.8, 0.3) * (1.0 - u_explosionAge) * 0.4;
                    }

                    // Fade at edges
                    col *= smoothstep(2.5, 0.2, r);

                    col *= 0.7 + u_beat * 0.3;
                    col *= 1.0 + u_thrust * 0.3;
                    col = mix(col, vec3(1.0), u_hyperspace * 2.0);

                    gl_FragColor = vec4(col, 1.0);
                }
            `
        },
        // 4: Digital Rain - matrix-style with game data
        {
            name: 'DIGITAL RAIN',
            desc: 'Data streams flowing with game energy',
            code: `
                precision highp float;
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform vec2 u_ship;
                uniform vec2 u_shipVel;
                uniform float u_angle;
                uniform float u_thrust;
                uniform float u_score;
                uniform float u_level;
                uniform vec2 u_explosion;
                uniform float u_explosionAge;
                uniform float u_beat;
                uniform float u_hyperspace;

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                }

                void main() {
                    vec2 uv = gl_FragCoord.xy / u_resolution;
                    vec2 p = uv;

                    float t = u_time;

                    // Grid
                    float cols = 30.0 + u_level * 5.0;
                    vec2 grid = vec2(cols, cols * u_resolution.y / u_resolution.x);
                    vec2 cell = floor(p * grid);

                    // Rain speed per column influenced by ship
                    float colSpeed = 1.0 + hash(vec2(cell.x, 0.0)) * 2.0;
                    colSpeed += u_thrust * 2.0;
                    colSpeed += length(u_shipVel) * 0.5;

                    // Falling position
                    float fall = fract(hash(vec2(cell.x, 1.0)) - t * colSpeed * 0.2);

                    // Cell brightness
                    float bright = smoothstep(0.0, 0.8, fall) * smoothstep(1.0, 0.3, fall);

                    // Flicker
                    float flicker = step(0.7, hash(cell + floor(t * 8.0)));
                    bright *= 0.5 + flicker * 0.5;

                    // Ship proximity glow
                    float shipDist = length(uv - u_ship);
                    bright += 0.3 / (shipDist + 0.3) * u_thrust;

                    // Explosion wave
                    if (u_explosionAge < 1.0) {
                        float d = length(uv - u_explosion);
                        float wave = smoothstep(0.02, 0.0, abs(d - u_explosionAge * 0.8));
                        bright += wave * 3.0 * (1.0 - u_explosionAge);
                    }

                    vec3 col = vec3(0.1, 1.0, 0.3) * bright;
                    col += vec3(0.0, 0.3, 0.1) * bright * u_beat;

                    // Level color shift
                    float hueShift = u_level * 0.3;
                    col = mix(col, vec3(bright * 0.3, bright * 0.5, bright * 1.0), sin(hueShift) * 0.5 + 0.5);

                    col = mix(col, vec3(1.0), u_hyperspace * 2.0);

                    gl_FragColor = vec4(col, 1.0);
                }
            `
        }
    ];

    function init(displayCanvas, backgroundCanvas, infoElement) {
        canvas = displayCanvas;
        bgCanvas = backgroundCanvas;
        infoEl = infoElement;

        // Init display shader canvas
        gl = canvas.getContext('webgl', { alpha: false, antialias: false });
        if (!gl) {
            console.warn('WebGL not available for shader display');
            return false;
        }

        // Init background shader canvas
        bgGl = bgCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });

        // Set canvas sizes
        canvas.width = 320;
        canvas.height = 320;

        startTime = performance.now() / 1000;

        // Build initial shader
        buildShader(gl, 0);
        if (bgGl) buildBgShader(bgGl, 0);

        initialized = true;
        return true;
    }

    function createShaderProgram(glCtx, fragSource) {
        const vs = glCtx.createShader(glCtx.VERTEX_SHADER);
        glCtx.shaderSource(vs, vertexShaderSource);
        glCtx.compileShader(vs);
        if (!glCtx.getShaderParameter(vs, glCtx.COMPILE_STATUS)) {
            console.error('Vertex shader error:', glCtx.getShaderInfoLog(vs));
            return null;
        }

        const fs = glCtx.createShader(glCtx.FRAGMENT_SHADER);
        glCtx.shaderSource(fs, fragSource);
        glCtx.compileShader(fs);
        if (!glCtx.getShaderParameter(fs, glCtx.COMPILE_STATUS)) {
            console.error('Fragment shader error:', glCtx.getShaderInfoLog(fs));
            return null;
        }

        const prog = glCtx.createProgram();
        glCtx.attachShader(prog, vs);
        glCtx.attachShader(prog, fs);
        glCtx.linkProgram(prog);
        if (!glCtx.getProgramParameter(prog, glCtx.LINK_STATUS)) {
            console.error('Program link error:', glCtx.getProgramInfoLog(prog));
            return null;
        }

        return prog;
    }

    function setupQuad(glCtx, prog) {
        const buf = glCtx.createBuffer();
        glCtx.bindBuffer(glCtx.ARRAY_BUFFER, buf);
        glCtx.bufferData(glCtx.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1
        ]), glCtx.STATIC_DRAW);

        const pos = glCtx.getAttribLocation(prog, 'a_position');
        glCtx.enableVertexAttribArray(pos);
        glCtx.vertexAttribPointer(pos, 2, glCtx.FLOAT, false, 0, 0);
    }

    function getUniforms(glCtx, prog) {
        return {
            u_time: glCtx.getUniformLocation(prog, 'u_time'),
            u_resolution: glCtx.getUniformLocation(prog, 'u_resolution'),
            u_ship: glCtx.getUniformLocation(prog, 'u_ship'),
            u_shipVel: glCtx.getUniformLocation(prog, 'u_shipVel'),
            u_angle: glCtx.getUniformLocation(prog, 'u_angle'),
            u_thrust: glCtx.getUniformLocation(prog, 'u_thrust'),
            u_score: glCtx.getUniformLocation(prog, 'u_score'),
            u_level: glCtx.getUniformLocation(prog, 'u_level'),
            u_explosion: glCtx.getUniformLocation(prog, 'u_explosion'),
            u_explosionAge: glCtx.getUniformLocation(prog, 'u_explosionAge'),
            u_beat: glCtx.getUniformLocation(prog, 'u_beat'),
            u_hyperspace: glCtx.getUniformLocation(prog, 'u_hyperspace'),
        };
    }

    function buildShader(glCtx, index) {
        const shader = fragmentShaders[index];
        const prog = createShaderProgram(glCtx, shader.code);
        if (!prog) return false;

        glCtx.useProgram(prog);
        setupQuad(glCtx, prog);

        if (glCtx === gl) {
            program = prog;
            uniforms = getUniforms(glCtx, prog);
        } else {
            bgProgram = prog;
            bgUniforms = getUniforms(glCtx, prog);
        }

        currentShaderIndex = index;

        // Update info display
        if (infoEl) {
            infoEl.textContent = `[${shader.name}]\n${shader.desc}\n\nShader ${index + 1}/${fragmentShaders.length}\nUniforms: ship, velocity,\nangle, thrust, explosions,\nscore, level, beat`;
        }

        return true;
    }

    function buildBgShader(glCtx, index) {
        const shader = fragmentShaders[index];
        const prog = createShaderProgram(glCtx, shader.code);
        if (!prog) return false;

        glCtx.useProgram(prog);
        setupQuad(glCtx, prog);
        bgProgram = prog;
        bgUniforms = getUniforms(glCtx, prog);
        return true;
    }

    function nextShader() {
        const next = (currentShaderIndex + 1) % fragmentShaders.length;
        buildShader(gl, next);
        if (bgGl) buildBgShader(bgGl, next);
    }

    function updateState(gameState) {
        if (!gameState) return;
        Object.assign(state, gameState);
    }

    function setUniforms(glCtx, u) {
        const t = performance.now() / 1000 - startTime;

        if (u.u_time) glCtx.uniform1f(u.u_time, t);
        if (u.u_resolution) glCtx.uniform2f(u.u_resolution, glCtx.canvas.width, glCtx.canvas.height);
        if (u.u_ship) glCtx.uniform2f(u.u_ship, state.shipX, 1.0 - state.shipY); // Flip Y
        if (u.u_shipVel) glCtx.uniform2f(u.u_shipVel, state.shipVx, -state.shipVy);
        if (u.u_angle) glCtx.uniform1f(u.u_angle, state.shipAngle);
        if (u.u_thrust) glCtx.uniform1f(u.u_thrust, state.thrust);
        if (u.u_score) glCtx.uniform1f(u.u_score, state.score);
        if (u.u_level) glCtx.uniform1f(u.u_level, state.level);
        if (u.u_explosion) glCtx.uniform2f(u.u_explosion, state.explosionX, 1.0 - state.explosionY);
        if (u.u_explosionAge) glCtx.uniform1f(u.u_explosionAge, state.explosionAge);
        if (u.u_beat) glCtx.uniform1f(u.u_beat, state.beat);
        if (u.u_hyperspace) glCtx.uniform1f(u.u_hyperspace, state.hyperspace);
    }

    function render() {
        if (!initialized || !gl || !program) return;

        // Render display panel shader
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.useProgram(program);
        setUniforms(gl, uniforms);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Render background overlay shader
        if (bgGl && bgProgram) {
            bgGl.viewport(0, 0, bgGl.canvas.width, bgGl.canvas.height);
            bgGl.useProgram(bgProgram);
            setUniforms(bgGl, bgUniforms);
            bgGl.drawArrays(bgGl.TRIANGLES, 0, 6);
        }
    }

    function resizeBgCanvas(w, h) {
        if (bgCanvas) {
            // Render at square resolution for balanced patterns;
            // CSS object-fit:cover handles display stretching
            const size = Math.min(Math.max(w, h), 512);
            bgCanvas.width = size;
            bgCanvas.height = size;
        }
    }

    function enableBackground(enabled) {
        if (bgCanvas) {
            bgCanvas.classList.toggle('active', enabled);
        }
    }

    return {
        init,
        updateState,
        render,
        nextShader,
        resizeBgCanvas,
        enableBackground,
        get currentShaderName() {
            return fragmentShaders[currentShaderIndex]?.name || '';
        },
        get shaderCount() {
            return fragmentShaders.length;
        }
    };
})();

