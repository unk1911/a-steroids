/**
 * A-STEROIDS Game Engine
 * Main game loop, state management, collision detection, rendering
 */
window.ASteroids.Game = (function () {
    // Canvas and context
    let canvas, ctx;
    let W = 800, H = 600;

    // Game state
    const STATE = {
        TITLE: 0,
        PLAYING: 1,
        GAME_OVER: 2,
        LEVEL_TRANSITION: 3,
        PAUSED: 4
    };
    let gameState = STATE.TITLE;
    let score = 0;
    let highScore = parseInt(localStorage.getItem('asteroids_highscore') || '0', 10);
    let lives = 3;
    let level = 1;
    let extraLifeThreshold = 10000;

    // Entities
    let ship = null;
    let asteroids = [];
    let bullets = [];
    let particles = [];
    let debris = [];
    let ufo = null;
    let enemyBullets = [];

    // Timers
    let levelTransitionTimer = 0;
    let ufoTimer = 0;
    let respawnTimer = 0;
    let fireTimer = 0;
    const FIRE_RATE = 8; // frames between shots
    let shaderBgEnabled = false;

    // Beat tracking
    let beatPhase = 0;
    let beatTimer = 0;

    // Explosion tracking for shaders
    let lastExplosion = { x: 0, y: 0, age: 1.0 };

    // Hyperspace cooldown
    let hyperCooldown = 0;

    // Mobile tap-to-shoot burst
    let burstRemaining = 0;
    let burstTimer = 0;

    // Stars background
    let stars = [];

    // Title animation
    let titleTime = 0;

    function init(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');

        resize();
        generateStars();

        // Handle window resize
        window.addEventListener('resize', resize);
    }

    function resize() {
        // Fill available space while maintaining aspect ratio
        const isTouch = ASteroids.Input && ASteroids.Input.isTouchDevice();

        if (isTouch) {
            // Mobile: fill the screen, use phone's natural aspect ratio
            W = window.innerWidth - 4;
            H = window.innerHeight - 4;
        } else {
            const aspect = 4 / 3;
            // Desktop: leave room for shader panel
            const maxW = window.innerWidth - 380;
            const maxH = window.innerHeight - 60;

            H = Math.min(680, Math.max(450, maxH));
            W = Math.floor(H * aspect);
            if (W > maxW) {
                W = Math.max(600, maxW);
                H = Math.floor(W / aspect);
            }
        }

        canvas.width = W;
        canvas.height = H;

        // Resize the shader background canvas too
        if (ASteroids.Shader) {
            ASteroids.Shader.resizeBgCanvas(W, H);
        }
    }

    function generateStars() {
        stars = [];
        for (let i = 0; i < 80; i++) {
            stars.push({
                x: Math.random() * 1200,
                y: Math.random() * 900,
                brightness: 0.2 + Math.random() * 0.6,
                size: 0.5 + Math.random() * 1.5
            });
        }
    }

    function startGame() {
        score = 0;
        lives = 3;
        level = 1;
        extraLifeThreshold = 10000;
        asteroids = [];
        bullets = [];
        particles = [];
        debris = [];
        enemyBullets = [];
        ufo = null;

        ship = new ASteroids.Ship(W / 2, H / 2);
        ship.invulnerable = 120; // 2 seconds of invulnerability at start

        spawnAsteroids();

        gameState = STATE.PLAYING;
        fireTimer = 0;
        ufoTimer = 300 + Math.floor(Math.random() * 300);

        ASteroids.Audio.init();
        ASteroids.Audio.resume();
        ASteroids.Audio.startHeartbeat(800);

        // Enable shader background after a short delay
        setTimeout(() => {
            shaderBgEnabled = true;
            ASteroids.Shader.enableBackground(true);
        }, 2000);
    }

    function spawnAsteroids() {
        const count = Math.min(4 + level, 12);
        for (let i = 0; i < count; i++) {
            let x, y;
            // Don't spawn too close to ship
            do {
                x = Math.random() * W;
                y = Math.random() * H;
            } while (ship && dist(x, y, ship.x, ship.y) < 150);

            asteroids.push(new ASteroids.Asteroid(x, y, 3, level));
        }
    }

    function dist(x1, y1, x2, y2) {
        const dx = x1 - x2;
        const dy = y1 - y2;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function circleCollision(a, b) {
        return dist(a.x, a.y, b.x, b.y) < a.radius + b.radius;
    }

    function update() {
        titleTime++;

        switch (gameState) {
            case STATE.TITLE:
                updateTitle();
                break;
            case STATE.PLAYING:
                updatePlaying();
                break;
            case STATE.LEVEL_TRANSITION:
                updateLevelTransition();
                break;
            case STATE.GAME_OVER:
                updateGameOver();
                break;
            case STATE.PAUSED:
                if (ASteroids.Input.pause()) {
                    gameState = STATE.PLAYING;
                    ASteroids.Audio.uiSelect();
                }
                break;
        }

        // Update explosion age for shaders
        if (lastExplosion.age < 1.0) {
            lastExplosion.age += 0.02;
        }

        // Hyperspace cooldown
        if (hyperCooldown > 0) hyperCooldown--;
    }

    function updateTitle() {
        // Floating asteroids on title screen
        if (asteroids.length === 0) {
            for (let i = 0; i < 6; i++) {
                asteroids.push(new ASteroids.Asteroid(
                    Math.random() * W, Math.random() * H, 3, 1
                ));
            }
        }
        asteroids.forEach(a => a.update(W, H));
        particles.forEach(p => p.update());
        particles = particles.filter(p => p.alive);

        if (ASteroids.Input.start()) {
            ASteroids.Audio.init();
            ASteroids.Audio.resume();
            ASteroids.Audio.uiSelect();
            asteroids = [];
            startGame();
        }
    }

    function updatePlaying() {
        // Pause
        if (ASteroids.Input.pause()) {
            gameState = STATE.PAUSED;
            ASteroids.Audio.uiSelect();
            return;
        }

        // Ship controls
        if (ship && ship.alive) {
            ship.rotatingLeft = ASteroids.Input.left();
            ship.rotatingRight = ASteroids.Input.right();

            // Touch steering: rotate ship toward touch point
            const touch = ASteroids.Input.getTouchTarget();
            if (touch.active) {
                const targetAngle = Math.atan2(touch.y - ship.y, touch.x - ship.x);
                let angleDiff = targetAngle - ship.angle;
                // Normalize to [-PI, PI]
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                if (angleDiff > 0.05) {
                    ship.rotatingRight = true;
                    ship.rotatingLeft = false;
                } else if (angleDiff < -0.05) {
                    ship.rotatingLeft = true;
                    ship.rotatingRight = false;
                }
            }

            const wasThrusting = ship.thrust;
            ship.thrust = ASteroids.Input.up();

            if (ship.thrust && !wasThrusting) ASteroids.Audio.thrustOn();
            if (!ship.thrust && wasThrusting) ASteroids.Audio.thrustOff();

            // Tap-to-shoot: auto-aim at tap point + fire burst
            const tapTarget = ASteroids.Input.getTapTarget();
            if (tapTarget.active) {
                ship.angle = Math.atan2(tapTarget.y - ship.y, tapTarget.x - ship.x);
                burstRemaining = 2; // 2 more after initial shot = 3 total
                burstTimer = 4;
                ASteroids.Input.clearTapTarget();
            }

            // Firing
            fireTimer--;
            if (ASteroids.Input.shoot() && fireTimer <= 0) {
                const bx = ship.x + Math.cos(ship.angle) * 20;
                const by = ship.y + Math.sin(ship.angle) * 20;
                bullets.push(new ASteroids.Bullet(bx, by, ship.angle));
                ASteroids.Audio.fire();
                fireTimer = FIRE_RATE;
            }

            // Continue burst fire from tap-to-shoot
            if (burstRemaining > 0 && ship.alive) {
                burstTimer--;
                if (burstTimer <= 0) {
                    const bx = ship.x + Math.cos(ship.angle) * 20;
                    const by = ship.y + Math.sin(ship.angle) * 20;
                    bullets.push(new ASteroids.Bullet(bx, by, ship.angle));
                    ASteroids.Audio.fire();
                    burstRemaining--;
                    burstTimer = 4;
                }
            }

            // Hyperspace
            if (ASteroids.Input.hyperspace() && hyperCooldown <= 0) {
                ship.x = Math.random() * W;
                ship.y = Math.random() * H;
                ship.vx = 0;
                ship.vy = 0;
                ship.invulnerable = 30;
                hyperCooldown = 60;
                ASteroids.Audio.hyperspace();

                // Small chance of death from hyperspace (like original)
                if (Math.random() < 0.1) {
                    destroyShip();
                }
            }

            ship.update(W, H);
        }

        // Update entities
        asteroids.forEach(a => a.update(W, H));
        bullets.forEach(b => b.update(W, H));
        enemyBullets.forEach(b => b.update(W, H));
        particles.forEach(p => p.update());
        debris.forEach(d => d.update());

        // Filter dead
        bullets = bullets.filter(b => b.alive);
        enemyBullets = enemyBullets.filter(b => b.alive);
        particles = particles.filter(p => p.alive);
        debris = debris.filter(d => d.alive);

        // UFO logic
        updateUFO();

        // Collisions
        checkCollisions();

        // Check for level complete
        if (asteroids.length === 0 && (!ufo || !ufo.alive)) {
            gameState = STATE.LEVEL_TRANSITION;
            levelTransitionTimer = 120; // 2 seconds
            ASteroids.Audio.levelUp();
            ASteroids.Audio.stopHeartbeat();
        }

        // Beat speed based on asteroid count
        updateBeat();

        // Respawn
        if (ship && !ship.alive) {
            respawnTimer--;
            if (respawnTimer <= 0 && lives > 0) {
                ship = new ASteroids.Ship(W / 2, H / 2);
                ship.invulnerable = 180;
                ASteroids.Audio.startHeartbeat(getHeartbeatSpeed());
            }
        }
    }

    function updateLevelTransition() {
        levelTransitionTimer--;
        if (levelTransitionTimer <= 0) {
            level++;
            spawnAsteroids();
            gameState = STATE.PLAYING;
            ufoTimer = 200 + Math.floor(Math.random() * 300);
            ASteroids.Audio.startHeartbeat(getHeartbeatSpeed());

            // Cycle shader each level
            ASteroids.Shader.nextShader();
        }
        particles.forEach(p => p.update());
        debris.forEach(d => d.update());
        particles = particles.filter(p => p.alive);
        debris = debris.filter(d => d.alive);
    }

    function updateGameOver() {
        particles.forEach(p => p.update());
        debris.forEach(d => d.update());
        asteroids.forEach(a => a.update(W, H));
        particles = particles.filter(p => p.alive);
        debris = debris.filter(d => d.alive);

        if (ASteroids.Input.start()) {
            ASteroids.Audio.uiSelect();
            startGame();
        }
    }

    function updateUFO() {
        if (!ufo && gameState === STATE.PLAYING) {
            ufoTimer--;
            if (ufoTimer <= 0) {
                // Small UFO more likely at higher scores
                const isSmall = Math.random() < Math.min(0.3 + score / 40000, 0.8);
                ufo = new ASteroids.UFO(W, H, isSmall, level);
                ASteroids.Audio.saucerOn(isSmall);
                ufoTimer = 400 + Math.floor(Math.random() * 400);
            }
        }

        if (ufo && ufo.alive) {
            ufo.update(W, H, ship ? ship.x : W / 2, ship ? ship.y : H / 2);

            if (ufo.shouldShoot() && ship && ship.alive) {
                const angle = ufo.getShootAngle(ship.x, ship.y);
                enemyBullets.push(new ASteroids.Bullet(ufo.x, ufo.y, angle, true));
                ASteroids.Audio.fire();
            }

            if (!ufo.alive) {
                ASteroids.Audio.saucerOff();
                ufo = null;
            }
        }
    }

    function checkCollisions() {
        // Bullets vs Asteroids
        for (let i = bullets.length - 1; i >= 0; i--) {
            for (let j = asteroids.length - 1; j >= 0; j--) {
                if (circleCollision(bullets[i], asteroids[j])) {
                    // Destroy asteroid
                    const ast = asteroids[j];
                    addScore(ast.score);
                    triggerExplosion(ast.x, ast.y, ast.size);

                    // Split
                    const children = ast.split(level);
                    asteroids.splice(j, 1);
                    asteroids.push(...children);

                    // Remove bullet
                    bullets.splice(i, 1);
                    break;
                }
            }
        }

        // Bullets vs UFO
        if (ufo && ufo.alive) {
            for (let i = bullets.length - 1; i >= 0; i--) {
                if (circleCollision(bullets[i], ufo)) {
                    addScore(ufo.score);
                    triggerExplosion(ufo.x, ufo.y, 2);
                    ASteroids.Audio.saucerOff();
                    ufo.alive = false;
                    ufo = null;
                    bullets.splice(i, 1);
                    break;
                }
            }
        }

        // Ship vs Asteroids
        if (ship && ship.alive && ship.invulnerable <= 0) {
            for (let j = asteroids.length - 1; j >= 0; j--) {
                if (circleCollision(ship, asteroids[j])) {
                    // Also destroy the asteroid
                    const ast = asteroids[j];
                    triggerExplosion(ast.x, ast.y, ast.size);
                    const children = ast.split(level);
                    asteroids.splice(j, 1);
                    asteroids.push(...children);

                    destroyShip();
                    break;
                }
            }
        }

        // Ship vs UFO
        if (ship && ship.alive && ship.invulnerable <= 0 && ufo && ufo.alive) {
            if (circleCollision(ship, ufo)) {
                triggerExplosion(ufo.x, ufo.y, 2);
                ASteroids.Audio.saucerOff();
                ufo.alive = false;
                ufo = null;
                destroyShip();
            }
        }

        // Enemy bullets vs Ship
        if (ship && ship.alive && ship.invulnerable <= 0) {
            for (let i = enemyBullets.length - 1; i >= 0; i--) {
                if (dist(enemyBullets[i].x, enemyBullets[i].y, ship.x, ship.y) < ship.radius + 4) {
                    enemyBullets.splice(i, 1);
                    destroyShip();
                    break;
                }
            }
        }

        // Enemy bullets vs Asteroids (they can destroy asteroids too)
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            for (let j = asteroids.length - 1; j >= 0; j--) {
                if (circleCollision(enemyBullets[i], asteroids[j])) {
                    const ast = asteroids[j];
                    triggerExplosion(ast.x, ast.y, ast.size);
                    const children = ast.split(level);
                    asteroids.splice(j, 1);
                    asteroids.push(...children);
                    enemyBullets.splice(i, 1);
                    break;
                }
            }
        }
    }

    function destroyShip() {
        if (!ship || !ship.alive) return;
        ship.alive = false;
        ASteroids.Audio.thrustOff();
        triggerExplosion(ship.x, ship.y, 3);
        lives--;

        if (lives <= 0) {
            gameState = STATE.GAME_OVER;
            ASteroids.Audio.stopHeartbeat();
            ASteroids.Audio.saucerOff();
            ASteroids.Audio.gameOver();
            if (score > highScore) {
                highScore = score;
                localStorage.setItem('asteroids_highscore', String(highScore));
            }
        } else {
            respawnTimer = 120; // 2 seconds before respawn
        }
    }

    function addScore(points) {
        const oldScore = score;
        score += points;

        // Extra life every 10000 points
        if (Math.floor(score / extraLifeThreshold) > Math.floor(oldScore / extraLifeThreshold)) {
            lives++;
            ASteroids.Audio.extraLife();
            extraLifeThreshold += 10000;
        }
    }

    function triggerExplosion(x, y, size) {
        const count = [0, 8, 15, 25][size] || 12;
        const speed = [0, 2, 3, 4][size] || 3;
        particles.push(...ASteroids.createExplosion(x, y, count, speed));
        debris.push(...ASteroids.createDebris(x, y, Math.floor(count / 2)));
        ASteroids.Audio.explode(size);

        // Track for shader
        lastExplosion = { x: x / W, y: y / H, age: 0 };
    }

    function getHeartbeatSpeed() {
        // Faster heartbeat with fewer asteroids
        const total = asteroids.length;
        if (total <= 2) return 200;
        if (total <= 4) return 300;
        if (total <= 8) return 450;
        if (total <= 12) return 600;
        return 800;
    }

    function updateBeat() {
        beatTimer++;
        const speed = getHeartbeatSpeed();
        if (beatTimer >= speed / 16) {
            beatPhase = (beatPhase + 0.1) % (Math.PI * 2);
            beatTimer = 0;
        }
        ASteroids.Audio.updateHeartbeat(speed);
    }

    // ===== RENDERING =====

    function draw() {
        // Clear
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        // Stars
        ctx.shadowBlur = 0;
        stars.forEach(s => {
            const flicker = s.brightness + Math.sin(titleTime * 0.05 + s.x) * 0.1;
            ctx.fillStyle = `rgba(255, 255, 255, ${flicker})`;
            ctx.fillRect(s.x % W, s.y % H, s.size, s.size);
        });

        switch (gameState) {
            case STATE.TITLE:
                drawTitle();
                break;
            case STATE.PLAYING:
                drawGame();
                break;
            case STATE.LEVEL_TRANSITION:
                drawGame();
                drawLevelTransition();
                break;
            case STATE.GAME_OVER:
                drawGame();
                drawGameOver();
                break;
            case STATE.PAUSED:
                drawGame();
                drawPaused();
                break;
        }
    }

    function drawTitle() {
        asteroids.forEach(a => a.draw(ctx));
        particles.forEach(p => p.draw(ctx));

        // Scale fonts for small screens
        const s = Math.min(1, W / 600);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 15;

        // Title with retro flicker
        const flicker = 0.85 + Math.sin(titleTime * 0.08) * 0.15;
        ctx.fillStyle = `rgba(255, 255, 255, ${flicker})`;

        ctx.font = `bold ${Math.floor(60 * s)}px "Courier New", monospace`;
        ctx.fillText('A-STEROIDS', W / 2, H / 2 - 80 * s);

        ctx.shadowBlur = 5;
        ctx.font = `${Math.floor(14 * s)}px "Courier New", monospace`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillText('A nod to the 1979 Atari classic', W / 2, H / 2 - 40 * s);

        ctx.font = `${Math.floor(18 * s)}px "Courier New", monospace`;
        ctx.fillStyle = '#fff';

        const isTouch = ASteroids.Input && ASteroids.Input.isTouchDevice();

        if (isTouch) {
            ctx.fillText('TAP TO START', W / 2, H / 2 + 30 * s);

            ctx.font = `${Math.floor(12 * s)}px "Courier New", monospace`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            const mobileControls = [
                'TAP TO AIM & FIRE',
                'HOLD TO FLY'
            ];
            mobileControls.forEach((line, i) => {
                ctx.fillText(line, W / 2, H / 2 + (80 + i * 20) * s);
            });
        } else {
            ctx.fillText('PRESS ENTER TO START', W / 2, H / 2 + 30);

            // Controls
            ctx.font = '12px "Courier New", monospace';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            const controls = [
                'ARROW KEYS / WASD - MOVE',
                'SPACE - FIRE',
                'SHIFT / H - HYPERSPACE',
                'P / ESC - PAUSE',
                'V - CYCLE SHADER',
                'B - TOGGLE SHADER BG',
                'M - MUTE'
            ];
            controls.forEach((line, i) => {
                ctx.fillText(line, W / 2, H / 2 + 80 + i * 20);
            });
        }

        // High score
        if (highScore > 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = `${Math.floor(12 * s)}px "Courier New", monospace`;
            ctx.fillText(`HIGH SCORE: ${highScore}`, W / 2, H / 2 + 240 * s);
        }

        // Dedication
        ctx.font = `${Math.floor(11 * s)}px "Courier New", monospace`;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + Math.sin(titleTime * 0.03) * 0.1})`;
        ctx.fillText('Dedicated To: Bebzer (a.k.a. The Love-Terrorist Group)', W / 2, H - 25);

        ctx.restore();
    }

    function drawGame() {
        // Draw all entities
        asteroids.forEach(a => a.draw(ctx));
        if (ship) ship.draw(ctx);
        bullets.forEach(b => b.draw(ctx));
        enemyBullets.forEach(b => b.draw(ctx));
        if (ufo && ufo.alive) ufo.draw(ctx);
        particles.forEach(p => p.draw(ctx));
        debris.forEach(d => d.draw(ctx));

        // HUD
        drawHUD();
    }

    function drawHUD() {
        ctx.save();
        ctx.shadowBlur = 0;

        // Score
        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(String(score).padStart(6, '0'), 15, 30);

        // Lives (ship icons)
        for (let i = 0; i < lives; i++) {
            ctx.save();
            ctx.translate(W - 30 - i * 25, 25);
            ctx.rotate(-Math.PI / 2);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(10, 0);
            ctx.lineTo(-7, -6);
            ctx.lineTo(-4, 0);
            ctx.lineTo(-7, 6);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
        }

        // Level
        ctx.font = '14px "Courier New", monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.textAlign = 'center';
        ctx.fillText(`LEVEL ${level}`, W / 2, 25);

        ctx.restore();
    }

    function drawLevelTransition() {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = 'bold 36px "Courier New", monospace';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 15;

        const alpha = Math.min(1, (120 - levelTransitionTimer) / 30);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fillText(`LEVEL ${level + 1}`, W / 2, H / 2);

        ctx.restore();
    }

    function drawGameOver() {
        const s = Math.min(1, W / 600);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 10;

        ctx.font = `bold ${Math.floor(48 * s)}px "Courier New", monospace`;
        ctx.fillStyle = '#fff';
        ctx.fillText('GAME OVER', W / 2, H / 2 - 30);

        ctx.font = `${Math.floor(20 * s)}px "Courier New", monospace`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText(`SCORE: ${score}`, W / 2, H / 2 + 20);

        if (score >= highScore && score > 0) {
            ctx.fillStyle = '#ff0';
            ctx.fillText('NEW HIGH SCORE!', W / 2, H / 2 + 50);
        }

        const blink = Math.sin(titleTime * 0.08) > 0;
        if (blink) {
            ctx.font = `${Math.floor(16 * s)}px "Courier New", monospace`;
            ctx.fillStyle = '#fff';
            const isTouch = ASteroids.Input && ASteroids.Input.isTouchDevice();
            ctx.fillText(isTouch ? 'TAP TO PLAY AGAIN' : 'PRESS ENTER TO PLAY AGAIN', W / 2, H / 2 + 90);
        }

        ctx.restore();
    }

    function drawPaused() {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = 'bold 36px "Courier New", monospace';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 10;
        ctx.fillText('PAUSED', W / 2, H / 2);
        ctx.restore();
    }

    // Get game state for shader
    function getShaderState() {
        return {
            shipX: ship ? ship.x / W : 0.5,
            shipY: ship ? ship.y / H : 0.5,
            shipVx: ship ? ship.vx / 10 : 0,
            shipVy: ship ? ship.vy / 10 : 0,
            shipAngle: ship ? ship.angle : 0,
            thrust: ship && ship.thrust ? 1.0 : 0.0,
            score: score,
            lives: lives,
            level: level,
            explosionX: lastExplosion.x,
            explosionY: lastExplosion.y,
            explosionAge: lastExplosion.age,
            asteroidCount: asteroids.length,
            beat: Math.sin(beatPhase) * 0.5 + 0.5,
            hyperspace: hyperCooldown > 50 ? (hyperCooldown - 50) / 10 : 0
        };
    }

    // Keyboard shortcuts for shader control
    function handleShaderKeys() {
        if (ASteroids.Input.wasPressed('KeyV')) {
            ASteroids.Shader.nextShader();
            ASteroids.Audio.uiSelect();
        }
        if (ASteroids.Input.wasPressed('KeyB')) {
            shaderBgEnabled = !shaderBgEnabled;
            ASteroids.Shader.enableBackground(shaderBgEnabled);
            ASteroids.Audio.uiSelect();
        }
        if (ASteroids.Input.wasPressed('KeyM')) {
            ASteroids.Audio.toggleMute();
            ASteroids.Audio.uiSelect();
        }
    }

    return {
        init,
        update,
        draw,
        getShaderState,
        handleShaderKeys,
        get state() { return gameState; },
        get score() { return score; },
        get level() { return level; },
        get width() { return W; },
        get height() { return H; }
    };
})();

