/**
 * A-STEROIDS Game Entities
 * Ship, Asteroid, Bullet, UFO, Particle
 * Classic vector-style rendering
 */
// =========================================
// SHIP
// =========================================
window.ASteroids.Ship = class Ship {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.angle = -Math.PI / 2; // Pointing up
        this.radius = 15;
        this.thrust = false;
        this.rotatingLeft = false;
        this.rotatingRight = false;
        this.firing = false;
        this.alive = true;
        this.invulnerable = 0; // Timer for respawn invulnerability
        this.respawnTimer = 0;
        this.flickerTimer = 0;

        // Physics constants
        this.rotSpeed = 0.07;
        this.thrustPower = 0.12;
        this.friction = 0.992;
        this.maxSpeed = 8;

        // Flame animation
        this.flameFlicker = 0;
    }

    update(w, h) {
        if (!this.alive) return;

        // Rotation
        if (this.rotatingLeft) this.angle -= this.rotSpeed;
        if (this.rotatingRight) this.angle += this.rotSpeed;

        // Thrust
        if (this.thrust) {
            this.vx += Math.cos(this.angle) * this.thrustPower;
            this.vy += Math.sin(this.angle) * this.thrustPower;
            this.flameFlicker = (this.flameFlicker + 1) % 4;
        }

        // Speed limit
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed > this.maxSpeed) {
            this.vx = (this.vx / speed) * this.maxSpeed;
            this.vy = (this.vy / speed) * this.maxSpeed;
        }

        // Friction
        this.vx *= this.friction;
        this.vy *= this.friction;

        // Position
        this.x += this.vx;
        this.y += this.vy;

        // Screen wrapping
        if (this.x < -this.radius) this.x = w + this.radius;
        if (this.x > w + this.radius) this.x = -this.radius;
        if (this.y < -this.radius) this.y = h + this.radius;
        if (this.y > h + this.radius) this.y = -this.radius;

        // Invulnerability countdown
        if (this.invulnerable > 0) {
            this.invulnerable--;
            this.flickerTimer++;
        }
    }

    draw(ctx) {
        if (!this.alive) return;
        // Flicker when invulnerable
        if (this.invulnerable > 0 && Math.floor(this.flickerTimer / 4) % 2 === 0) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Ship body - classic triangle
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-12, -10);
        ctx.lineTo(-7, 0);
        ctx.lineTo(-12, 10);
        ctx.closePath();
        ctx.stroke();

        // Thrust flame
        if (this.thrust) {
            ctx.strokeStyle = '#ff6600';
            ctx.shadowColor = '#ff6600';
            ctx.shadowBlur = 8;
            const flameLen = 8 + Math.random() * 8;
            ctx.beginPath();
            ctx.moveTo(-7, -4);
            ctx.lineTo(-7 - flameLen, 0);
            ctx.lineTo(-7, 4);
            ctx.stroke();
        }

        ctx.restore();
    }

    getPoints() {
        // Return the three vertices of the ship triangle (world coords)
        const cos = Math.cos(this.angle);
        const sin = Math.sin(this.angle);
        return [
            { x: this.x + 18 * cos, y: this.y + 18 * sin },
            { x: this.x + (-12) * cos - (-10) * sin, y: this.y + (-12) * sin + (-10) * cos },
            { x: this.x + (-12) * cos - (10) * sin, y: this.y + (-12) * sin + (10) * cos }
        ];
    }
};

// =========================================
// ASTEROID
// =========================================
window.ASteroids.Asteroid = class Asteroid {
    constructor(x, y, size, level) {
        this.x = x;
        this.y = y;
        this.size = size; // 3=large, 2=medium, 1=small
        this.radius = [0, 12, 24, 40][size];
        this.level = level || 1;

        // Random velocity, faster for smaller asteroids and higher levels
        const speedMult = (4 - size) * 0.5 + 0.5 + (level - 1) * 0.15;
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * speedMult * (0.5 + Math.random());
        this.vy = Math.sin(angle) * speedMult * (0.5 + Math.random());

        // Slow rotation for visual effect
        this.rotAngle = 0;
        this.rotSpeed = (Math.random() - 0.5) * 0.03;

        // Generate random jagged polygon vertices
        this.vertices = this._generateVertices();
    }

    _generateVertices() {
        const numVerts = 8 + Math.floor(Math.random() * 5);
        const verts = [];
        for (let i = 0; i < numVerts; i++) {
            const angle = (i / numVerts) * Math.PI * 2;
            const jag = this.radius * (0.7 + Math.random() * 0.3);
            verts.push({
                x: Math.cos(angle) * jag,
                y: Math.sin(angle) * jag
            });
        }
        return verts;
    }

    update(w, h) {
        this.x += this.vx;
        this.y += this.vy;
        this.rotAngle += this.rotSpeed;

        // Screen wrapping
        if (this.x < -this.radius) this.x = w + this.radius;
        if (this.x > w + this.radius) this.x = -this.radius;
        if (this.y < -this.radius) this.y = h + this.radius;
        if (this.y > h + this.radius) this.y = -this.radius;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotAngle);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
        for (let i = 1; i < this.vertices.length; i++) {
            ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
    }

    // Split into smaller asteroids
    split(level) {
        if (this.size <= 1) return [];
        const newSize = this.size - 1;
        return [
            new window.ASteroids.Asteroid(this.x, this.y, newSize, level),
            new window.ASteroids.Asteroid(this.x, this.y, newSize, level)
        ];
    }

    get score() {
        return [0, 100, 50, 20][this.size];
    }
};

// =========================================
// BULLET
// =========================================
window.ASteroids.Bullet = class Bullet {
    constructor(x, y, angle, isEnemy) {
        this.x = x;
        this.y = y;
        this.isEnemy = isEnemy || false;
        const speed = isEnemy ? 5 : 10;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = isEnemy ? 80 : 45; // frames
        this.radius = 2;
    }

    update(w, h) {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;

        // Screen wrapping
        if (this.x < 0) this.x = w;
        if (this.x > w) this.x = 0;
        if (this.y < 0) this.y = h;
        if (this.y > h) this.y = 0;
    }

    draw(ctx) {
        ctx.fillStyle = this.isEnemy ? '#f44' : '#fff';
        ctx.shadowColor = this.isEnemy ? '#f44' : '#fff';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    get alive() {
        return this.life > 0;
    }
};

// =========================================
// UFO / SAUCER
// =========================================
window.ASteroids.UFO = class UFO {
    constructor(w, h, isSmall, level) {
        this.isSmall = isSmall;
        this.radius = isSmall ? 12 : 22;
        this.score = isSmall ? 1000 : 200;
        this.level = level || 1;

        // Enter from left or right
        const side = Math.random() < 0.5 ? -1 : 1;
        this.x = side === -1 ? -this.radius : w + this.radius;
        this.y = Math.random() * h;

        this.vx = side * (1.5 + Math.random() * 1.5);
        this.vy = 0;
        this.alive = true;

        // Direction change timer
        this.dirChangeTimer = 60 + Math.floor(Math.random() * 60);
        this.shootTimer = 40 + Math.floor(Math.random() * 40);
    }

    update(w, h, shipX, shipY) {
        this.x += this.vx;
        this.y += this.vy;

        // Random vertical direction changes
        this.dirChangeTimer--;
        if (this.dirChangeTimer <= 0) {
            this.vy = (Math.random() - 0.5) * 3;
            this.dirChangeTimer = 30 + Math.floor(Math.random() * 60);
        }

        // Vertical wrapping
        if (this.y < -this.radius) this.y = h + this.radius;
        if (this.y > h + this.radius) this.y = -this.radius;

        // Dies when leaving horizontally
        if (this.x < -this.radius * 3 || this.x > w + this.radius * 3) {
            this.alive = false;
        }

        // Shooting
        this.shootTimer--;
    }

    shouldShoot() {
        if (this.shootTimer <= 0) {
            this.shootTimer = 30 + Math.floor(Math.random() * 50);
            return true;
        }
        return false;
    }

    getShootAngle(shipX, shipY) {
        if (this.isSmall) {
            // Small UFO aims at player with some inaccuracy
            const angle = Math.atan2(shipY - this.y, shipX - this.x);
            return angle + (Math.random() - 0.5) * 0.3;
        } else {
            // Large UFO shoots randomly
            return Math.random() * Math.PI * 2;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        const r = this.radius;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.2;
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 3;

        // Classic saucer shape
        ctx.beginPath();
        // Top dome
        ctx.moveTo(-r * 0.4, -r * 0.3);
        ctx.lineTo(-r * 0.2, -r * 0.6);
        ctx.lineTo(r * 0.2, -r * 0.6);
        ctx.lineTo(r * 0.4, -r * 0.3);
        // Middle band
        ctx.moveTo(-r, 0);
        ctx.lineTo(-r * 0.4, -r * 0.3);
        ctx.lineTo(r * 0.4, -r * 0.3);
        ctx.lineTo(r, 0);
        // Bottom
        ctx.lineTo(r * 0.5, r * 0.3);
        ctx.lineTo(-r * 0.5, r * 0.3);
        ctx.lineTo(-r, 0);
        ctx.stroke();

        ctx.restore();
    }
};

// =========================================
// PARTICLE (explosion effect)
// =========================================
window.ASteroids.Particle = class Particle {
    constructor(x, y, angle, speed, life) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = life || 30;
        this.maxLife = this.life;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.98;
        this.vy *= 0.98;
        this.life--;
    }

    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 3 * alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 1.5 * alpha + 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    get alive() {
        return this.life > 0;
    }
};

// Helper: create explosion particles at a position
window.ASteroids.createExplosion = function (x, y, count, speed) {
    const particles = [];
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = speed * (0.3 + Math.random() * 0.7);
        const life = 15 + Math.floor(Math.random() * 25);
        particles.push(new window.ASteroids.Particle(x, y, angle, spd, life));
    }
    return particles;
};

// Helper: create debris lines for asteroid destruction
window.ASteroids.DebrisLine = class DebrisLine {
    constructor(x, y) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 2;
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.angle = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 0.15;
        this.length = 4 + Math.random() * 8;
        this.life = 20 + Math.floor(Math.random() * 20);
        this.maxLife = this.life;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.angle += this.rotSpeed;
        this.life--;
    }

    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-this.length / 2, 0);
        ctx.lineTo(this.length / 2, 0);
        ctx.stroke();
        ctx.restore();
    }

    get alive() {
        return this.life > 0;
    }
};

window.ASteroids.createDebris = function (x, y, count) {
    const debris = [];
    for (let i = 0; i < count; i++) {
        debris.push(new window.ASteroids.DebrisLine(x, y));
    }
    return debris;
};

