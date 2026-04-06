/**
 * A-STEROIDS - Main Entry Point
 * Initializes all systems and runs the game loop
 */
(function () {
    'use strict';

    const gameCanvas = document.getElementById('gameCanvas');
    const shaderCanvas = document.getElementById('shaderCanvas');
    const shaderDisplayCanvas = document.getElementById('shaderDisplayCanvas');
    const shaderInfo = document.getElementById('shaderInfo');

    // Initialize systems
    ASteroids.Input.init();
    ASteroids.Game.init(gameCanvas);
    ASteroids.Shader.init(shaderDisplayCanvas, shaderCanvas, shaderInfo);

    // Main game loop
    let lastTime = 0;
    let accumulator = 0;
    const FIXED_DT = 1000 / 60; // 60 FPS fixed timestep

    function gameLoop(timestamp) {
        if (!lastTime) lastTime = timestamp;
        const deltaTime = Math.min(timestamp - lastTime, 50); // Cap at 50ms
        lastTime = timestamp;
        accumulator += deltaTime;

        // Fixed timestep updates
        while (accumulator >= FIXED_DT) {
            ASteroids.Game.update();
            ASteroids.Game.handleShaderKeys();
            ASteroids.Input.clearJustPressed();
            accumulator -= FIXED_DT;
        }

        // Render
        ASteroids.Game.draw();

        // Update shader with game state
        ASteroids.Shader.updateState(ASteroids.Game.getShaderState());
        ASteroids.Shader.render();

        requestAnimationFrame(gameLoop);
    }

    // Start the loop
    requestAnimationFrame(gameLoop);

    // Resume audio context on first interaction (browser policy)
    function resumeAudio() {
        ASteroids.Audio.init();
        ASteroids.Audio.resume();
    }
    document.addEventListener('click', resumeAudio, { once: false });
    document.addEventListener('keydown', resumeAudio, { once: false });

    console.log('%c A-STEROIDS %c loaded', 'background: #000; color: #fff; font-weight: bold; padding: 4px 8px;', '');
    console.log('Controls: Arrow keys/WASD=Move, Space=Fire, Shift/H=Hyperspace, V=Shader, B=Background, M=Mute');
})();
