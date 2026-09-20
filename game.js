import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';
import { isMuted, playCoin, playJump, playLose, playWin, startMusic, toggleMute } from './audio.js';

const screens = { intro: document.querySelector('#intro-screen'), home: document.querySelector('#home-screen'), game: document.querySelector('#game-screen') };
const canvas = document.querySelector('#game-canvas');
const progressBar = document.querySelector('#progress-bar');
const distanceValue = document.querySelector('#distance-value');
const message = document.querySelector('#game-message');
const messageTitle = document.querySelector('#message-title');
const messageKicker = document.querySelector('#message-kicker');
const keys = new Set();
let renderer, scene, camera, player, playerMixer, playerActions = {}, activePlayerAction, clock, animationFrame, attempt = 1, gameState;
const dummy = new THREE.Object3D();

function showScreen(name) { Object.values(screens).forEach(screen => screen.classList.add('hidden')); screens[name].classList.remove('hidden'); if (name === 'game') startGame(); }
async function loadHomePage() {
    const response = await fetch('home.html');
    const homeDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
    document.title = homeDocument.title;
    document.body.innerHTML = homeDocument.body.innerHTML;
    if (!document.querySelector('link[href="home.css"]')) {
        const homeStyles = document.createElement('link');
        homeStyles.rel = 'stylesheet';
        homeStyles.href = 'home.css';
        document.head.appendChild(homeStyles);
    }
    await import(`./home.js?home=${Date.now()}`);
}
document.querySelector('#trial-button').addEventListener('click', async () => {
    startMusic();
    localStorage.setItem('finish-line.selected-stage', '1');
    await loadHomePage();
});
document.querySelector('#play-button').addEventListener('click', () => { startMusic(); showScreen('game'); });
document.querySelector('#restart-button').addEventListener('click', startGame);
document.querySelector('#home-button').addEventListener('click', () => { cancelAnimationFrame(animationFrame); showScreen('home'); });
window.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(event.code)) { event.preventDefault(); keys.add(event.code); } });
window.addEventListener('keyup', event => keys.delete(event.code));
document.querySelectorAll('.touch-controls button').forEach(button => {
    const key = button.dataset.key;
    const release = () => keys.delete(key);
    button.addEventListener('pointerdown', event => {
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        keys.add(key);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => button.addEventListener(type, release));
});
const joystick = document.querySelector('.joystick');
const joystickKnob = document.querySelector('.joystick-knob');
const joystickKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
function resetJoystick() {
    joystickKeys.forEach(key => keys.delete(key));
    joystickKnob.style.transform = 'translate(-50%, -50%)';
}
function updateJoystick(event) {
    const rect = joystick.getBoundingClientRect();
    const radius = rect.width * .5;
    const knobRadius = joystickKnob.offsetWidth * .5;
    let dx = event.clientX - (rect.left + radius);
    let dy = event.clientY - (rect.top + radius);
    const maxDistance = radius - knobRadius;
    const distance = Math.hypot(dx, dy);
    if (distance > maxDistance) {
        dx = dx / distance * maxDistance;
        dy = dy / distance * maxDistance;
    }
    joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joystickKeys.forEach(key => keys.delete(key));
    const deadZone = maxDistance * .22;
    if (Math.abs(dx) > deadZone) keys.add(dx < 0 ? 'ArrowLeft' : 'ArrowRight');
    if (Math.abs(dy) > deadZone) keys.add(dy < 0 ? 'ArrowUp' : 'ArrowDown');
}
if (joystick) {
    joystick.addEventListener('pointerdown', event => {
        event.preventDefault();
        joystick.setPointerCapture?.(event.pointerId);
        updateJoystick(event);
    });
    joystick.addEventListener('pointermove', event => {
        if (joystick.hasPointerCapture?.(event.pointerId)) updateJoystick(event);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => joystick.addEventListener(type, resetJoystick));
}
const muteButton = document.querySelector('.mute-button');
function updateMuteButton() { const muted = isMuted(); muteButton.textContent = muted ? '🔇' : '🔊'; muteButton.setAttribute('aria-label', muted ? 'Unmute music' : 'Mute music'); }
updateMuteButton();
muteButton.addEventListener('click', () => { toggleMute(); updateMuteButton(); });

function createRenderer() { if (renderer) return; renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false }); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; }
function makeMaterial(color, roughness = .75, metalness = 0) { return new THREE.MeshStandardMaterial({ color, roughness, metalness }); }
function box(width, height, depth, x, y, z, color, falling = false) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), makeMaterial(color)); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData = { width, height, depth, falling, drop: 0 }; scene.add(mesh); return mesh; }
function addWorldBox(width, height, depth, x, y, z, color, emissive = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), makeMaterial(color, .82, emissive ? .35 : 0));
    if (emissive) {
        mesh.material.emissive = new THREE.Color(color);
        mesh.material.emissiveIntensity = .5;
    }
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
}
function makeGeneratedLayout(level) {
    const length = 128 + level * 3;
    const platforms = [];
    const gaps = [];
    let cursor = -2;
    let index = 0;
    while (cursor < length - 8) {
        const width = 4 + ((level + index * 3) % 4);
        const height = index === 0 ? 3 : 3 + ((level * 2 + index) % 5);
        const falling = index > 0 && (level + index) % 4 === 0;
        platforms.push([cursor, width, height, falling]);
        cursor += width;
        const gap = 3 + ((level + index) % Math.min(6, 3 + Math.floor(level / 6)));
        gaps.push([cursor, cursor + gap]);
        cursor += gap;
        index += 1;
    }
    platforms.push([cursor, 12, 3 + (level % 4), false]);
    return { gaps, platforms, goal: cursor + 10 };
}
function addTree(x, z, scale = 1, color = '#3d8b58') {
    addWorldBox(.35 * scale, 2.2 * scale, .35 * scale, x, 1.1 * scale, z, '#694832');
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.2 * scale, 12, 10), makeMaterial(color));
    crown.position.set(x, 2.7 * scale, z);
    crown.castShadow = true;
    scene.add(crown);
}
function addLamp(x, z, glowColor) {
    addWorldBox(.1, 2.6, .1, x, 1.3, z, '#333c3f');
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), makeMaterial(glowColor, .3, .2));
    bulb.material.emissive = new THREE.Color(glowColor);
    bulb.material.emissiveIntensity = .9;
    bulb.position.set(x, 2.62, z);
    scene.add(bulb);
}
function addRooftopProp(x, roofY, z, level, seed) {
    if (level === 3) {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1.4, 6), makeMaterial('#8fa3b0'));
        mast.position.set(x, roofY + .7, z);
        scene.add(mast);
        const light = new THREE.Mesh(new THREE.SphereGeometry(.11, 8, 8), makeMaterial('#ff5d7a', .3, .2));
        light.material.emissive = new THREE.Color('#ff5d7a');
        light.userData.phase = seed * .9;
        light.position.set(x, roofY + 1.5, z);
        scene.add(light);
        gameState.blinkers.push(light);
        return;
    }
    const kind = seed % 3;
    if (kind === 0) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .9, 10), makeMaterial('#8a6b4d'));
        tank.position.set(x, roofY + .55, z);
        tank.castShadow = true;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(.62, .4, 10), makeMaterial('#5c4530'));
        roof.position.set(x, roofY + 1.05, z);
        scene.add(tank, roof);
    } else if (kind === 1) {
        addWorldBox(.8, .5, .8, x, roofY + .25, z, '#5c6a6a');
    } else {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 1.1, 6), makeMaterial('#6d7277'));
        mast.position.set(x, roofY + .55, z);
        scene.add(mast);
    }
}
function addWindows(litList, darkList, x, y, z, width, height, cols, rows, litChance) {
    const marginX = width * .16, usableW = width - marginX * 2;
    const marginY = height * .16, usableH = height - marginY * 2;
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            const wx = x - width / 2 + marginX + (cols > 1 ? usableW * (c / (cols - 1)) : usableW / 2);
            const wy = y - height / 2 + marginY + (rows > 1 ? usableH * (r / (rows - 1)) : usableH / 2);
            (Math.random() < litChance ? litList : darkList).push([wx, wy, z]);
        }
    }
}
function buildInstancedWindows(transforms, color, emissive, size) {
    if (!transforms.length) return;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, .04), makeMaterial(color, .4, emissive ? .1 : 0), transforms.length);
    if (emissive) { mesh.material.emissive = new THREE.Color(color); mesh.material.emissiveIntensity = .85; }
    transforms.forEach(([x, y, z], i) => { dummy.position.set(x, y, z); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
}
function buildSkyline(goal, world, litColor) {
    const count = 46;
    const near = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), makeMaterial(world.skyline || world.accent, .95, 0), count);
    near.castShadow = false; near.receiveShadow = false;
    for (let i = 0; i < count; i++) {
        const x = -20 + Math.random() * (goal + 60);
        const z = (Math.random() < .5 ? -1 : 1) * (24 + Math.random() * 20);
        const h = 4 + Math.random() * 12, w = 2 + Math.random() * 3;
        dummy.position.set(x, h / 2 - .3, z);
        dummy.scale.set(w, h, w);
        dummy.updateMatrix();
        near.setMatrixAt(i, dummy.matrix);
    }
    near.instanceMatrix.needsUpdate = true;
    scene.add(near);
    if (!litColor) return;
    const glow = new THREE.InstancedMesh(new THREE.BoxGeometry(.12, .12, .12), makeMaterial(litColor, .3, .2), 30);
    glow.material.emissive = new THREE.Color(litColor);
    glow.material.emissiveIntensity = .8;
    for (let i = 0; i < 30; i++) {
        const x = -20 + Math.random() * (goal + 60);
        const z = (Math.random() < .5 ? -1 : 1) * (24 + Math.random() * 20) + (Math.random() < .5 ? -.6 : .6);
        dummy.position.set(x, 3 + Math.random() * 10, z);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        glow.setMatrixAt(i, dummy.matrix);
    }
    glow.instanceMatrix.needsUpdate = true;
    scene.add(glow);
}
function addClouds(goal, world) {
    const isNight = world.background === '#3b315f';
    for (let i = 0; i < 7; i++) {
        const group = new THREE.Group();
        const material = makeMaterial(isNight ? '#5a4d8f' : '#ffffff', .9, 0);
        material.transparent = true;
        material.opacity = isNight ? .42 : .55;
        material.depthWrite = false;
        if (isNight) { material.emissive = new THREE.Color('#7a5fd8'); material.emissiveIntensity = .25; }
        const lumps = 3 + Math.floor(Math.random() * 2);
        for (let l = 0; l < lumps; l++) {
            const puff = new THREE.Mesh(new THREE.SphereGeometry(1 + Math.random() * .6, 8, 6), material);
            puff.position.set(l * 1.3 - lumps * .6, Math.random() * .4, Math.random() * .6);
            puff.scale.y = .6;
            group.add(puff);
        }
        group.position.set(-15 + Math.random() * (goal + 30), 25 + Math.random() * 7, (Math.random() < .5 ? -1 : 1) * (28 + Math.random() * 14));
        group.renderOrder = -1;
        group.userData.speed = .35 + Math.random() * .4;
        scene.add(group);
        gameState.clouds.push(group);
    }
}
function addTownLantern(x, z) {
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 8), makeMaterial('#ffb454', .3, .2));
    lantern.material.emissive = new THREE.Color('#ffb454');
    lantern.material.emissiveIntensity = .7;
    lantern.position.set(x, 4.6, z);
    scene.add(lantern);
}
function buildEnvironment(level, goal, world) {
    const roadColor = level === 3 ? '#111b35' : level === 2 ? '#81735d' : '#3f474b';
    const buildingColors = level === 3 ? ['#263d78', '#713c9b', '#1c7893'] : level === 2 ? ['#c77f59', '#d8a66c', '#8d6770'] : ['#d99a6c', '#c9835b', '#b87a63'];
    addWorldBox(goal + 30, .15, 7, goal / 2, -.25, 10, roadColor);
    addWorldBox(goal + 30, .15, 7, goal / 2, -.25, -10, roadColor);
    const litWindows = [], darkWindows = [];
    for (let x = 4, i = 0; x < goal + 12; x += 7.5, i++) {
        const side = i % 2 ? -10 : 10;
        const towardTrack = i % 2 ? 1 : -1;
        const height = 2.4 + Math.abs(Math.sin(i * .7)) * (level === 3 ? 9 : 4.4) + (i % 4) * .6;
        const width = 4.2 + (i % 3) * .5;
        const depth = 4;
        const color = buildingColors[i % buildingColors.length];
        const baseY = height / 2;
        if (level === 2) {
            addWorldBox(width, height, depth, x, baseY, side, color);
            addWorldBox(width + .5, .25, depth + .5, x, height + .18, side, '#a84f3f');
            addWindows(litWindows, darkWindows, x, baseY, side + towardTrack * (depth / 2 + .03), width, height, Math.max(2, Math.round(width / 1.3)), Math.max(2, Math.round(height / 1.3)), .35);
            addTree(x + 3.4, side, .8);
            if (Math.random() < .5) addTownLantern(x, side + towardTrack * (depth / 2 + .7));
            if (i % 2 === 0) addRooftopProp(x, height, side, level, i);
        } else if (level === 3) {
            addWorldBox(width - .6, height, depth - .6, x, baseY, side, color, true);
            addWorldBox(width - .1, .12, depth - .1, x, height, side, '#4de1ff', true);
            addWindows(litWindows, darkWindows, x, baseY, side + towardTrack * ((depth - .6) / 2 + .03), width - .6, height, Math.max(2, Math.round(width / .9)), Math.max(3, Math.round(height / .9)), .7);
            addRooftopProp(x, height, side, level, i);
        } else {
            addWorldBox(width, height, depth, x, baseY, side, color);
            addWindows(litWindows, darkWindows, x, baseY, side + towardTrack * (depth / 2 + .03), width, height, Math.max(2, Math.round(width / 1.4)), Math.max(2, Math.round(height / 1.4)), .18);
            addWorldBox(width - 1, .15, .9, x, 1.55, side + towardTrack * (depth / 2 + .5), '#a84f3f');
            if (i % 2 === 0) addRooftopProp(x, height, side, level, i);
        }
    }
    buildInstancedWindows(darkWindows, level === 3 ? '#0c1a33' : '#3c5257', false, .34);
    buildInstancedWindows(litWindows, level === 3 ? '#7be8ff' : level === 2 ? '#ffdf9e' : '#bdeeff', true, .34);
    if (level === 2) {
        for (let x = 8; x < goal; x += 18) {
            addWorldBox(.12, 2.2, .12, x, 1.1, -6.8, '#d7c18b');
            addWorldBox(.12, 2.2, .12, x, 1.1, 6.8, '#d7c18b');
        }
    } else if (level === 3) {
        addWorldBox(goal + 10, .18, 1.2, goal / 2, 6.5, -6.8, '#4de1ff', true);
        addWorldBox(goal + 10, .18, 1.2, goal / 2, 6.5, 6.8, '#ff4fd8', true);
    }
    for (let x = 6; x < goal + 6; x += 16) {
        addLamp(x, 10.8, world.accent);
        addLamp(x, -10.8, world.accent);
    }
    buildSkyline(goal, world, level === 3 ? world.accent : level === 2 ? '#ffb454' : null);
    addClouds(goal, world);
}
function buildWorld() {
    const level = Number(localStorage.getItem('finish-line.selected-stage')) || 1;
    const world = level === 2 ? { background: '#6d9fb5', fog: '#6d9fb5', lava: '#f08a3c', accent: '#8ed3e8', skyline: '#4c7383' } : level === 3 ? { background: '#3b315f', fog: '#3b315f', lava: '#bd4eaa', accent: '#b6a0ff', skyline: '#241c42' } : { background: '#70c6bd', fog: '#70c6bd', lava: '#e84f35', accent: '#ffc857', skyline: '#4a988e' };
    scene = new THREE.Scene(); scene.background = new THREE.Color(world.background); scene.fog = new THREE.Fog(world.fog, 30, 100);
    camera = new THREE.PerspectiveCamera(70, 1, .1, 180); camera.position.set(-7, 15, 0); camera.lookAt(4, 2, 0);
    scene.add(new THREE.HemisphereLight('#fff4d3', '#356c72', 2.1)); const sun = new THREE.DirectionalLight('#fff0c2', 3.4); sun.position.set(-10, 18, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun);
    const layouts = { 1: { gaps: [[5, 10], [24, 29], [42, 49], [63, 70], [83, 90], [106, 113]], platforms: [[-2, 7, 3, false], [9, 6, 2, true], [16, 6, 3, false], [21, 4, 4, false], [29, 6, 3, true], [36, 5, 2, false], [49, 6, 3, false], [57, 5, 4, true], [70, 7, 3, false], [78, 4, 2, false], [90, 6, 3, true], [99, 7, 3, false], [113, 12, 3, false]], goal: 119 }, 2: { gaps: [[4, 11], [19, 27], [35, 42], [53, 62], [76, 84], [101, 110]], platforms: [[-2, 6, 4, false], [11, 5, 3, true], [16, 4, 5, false], [27, 7, 2, true], [42, 5, 4, false], [50, 4, 6, false], [62, 6, 3, true], [70, 6, 5, false], [84, 5, 3, true], [92, 5, 6, false], [110, 12, 4, false]], goal: 116 }, 3: { gaps: [[5, 13], [22, 31], [40, 50], [60, 72], [83, 94], [105, 116]], platforms: [[-2, 7, 5, false], [13, 5, 3, true], [19, 3, 6, false], [31, 7, 2, true], [50, 4, 5, false], [57, 3, 7, false], [72, 6, 4, true], [80, 3, 6, false], [94, 5, 3, true], [101, 4, 7, false], [116, 10, 5, false]], goal: 121 } };
    const layout = layouts[level] || makeGeneratedLayout(level); gameState.goal = layout.goal; buildEnvironment(level, layout.goal, world); layout.gaps.forEach(([from, to]) => { const strip = box(to - from, .22, 17, (from + to) / 2, -1.1, 0, world.lava); strip.material.emissive = new THREE.Color(world.lava); strip.material.emissiveIntensity = .7; });
    gameState.platforms = layout.platforms.map(([x, width, y, falling]) => box(width, .9, 3, x, y, 0, falling ? world.accent : '#263d3d', falling));
    const startingPlatform = gameState.platforms[0];
    gameState.x = startingPlatform.position.x;
    gameState.y = startingPlatform.position.y + .95;
    gameState.z = startingPlatform.position.z;
    const pathColor = level === 3 ? '#7558a8' : level === 2 ? '#4e8b9c' : '#3f6d63';
    const sidePathHeight = level === 3 ? 5 : level === 2 ? 4 : 3;
    gameState.platforms.push(box(layout.goal + 8, .8, 3, layout.goal / 2, sidePathHeight, -3, pathColor));
    gameState.platforms.push(box(layout.goal + 8, .8, 3, layout.goal / 2, sidePathHeight, 3, pathColor));
    for (let i = 0; i < 18; i++) {
        const rockX = 8 + i * 6.2;
        const support = gameState.platforms.find(platform => rockX > platform.position.x - platform.userData.width / 2 && rockX < platform.position.x + platform.userData.width / 2 && Math.abs(platform.position.z) < .1);
        if (!support) continue;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.55 + (i % 3) * .18), makeMaterial('#b94436'));
        rock.position.set(rockX, support.position.y + 1.15, (i % 3 - 1) * 2.3);
        rock.castShadow = true;
        rock.userData.movingRock = i % 3 === 0;
        rock.userData.baseZ = rock.position.z;
        rock.userData.phase = i * .8;
        scene.add(rock);
        gameState.rocks.push(rock);
    }
    [-3, 3].forEach((pathZ, pathIndex) => {
        for (let i = 0; i < 11; i++) {
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.5 + ((i + pathIndex) % 3) * .16), makeMaterial(pathIndex ? '#a94b3f' : '#b55b35'));
            rock.position.set(7 + i * 10.2 + (pathIndex ? 2 : 0), sidePathHeight + .7, pathZ);
            rock.castShadow = true;
            scene.add(rock);
            gameState.rocks.push(rock);
        }
    });
    const availableCoinPlatforms = gameState.platforms.filter(platform => platform.userData.width >= 3);
    const coinPlatforms = availableCoinPlatforms.filter(() => Math.random() < .5);
    if (!coinPlatforms.length && availableCoinPlatforms.length) {
        coinPlatforms.push(availableCoinPlatforms[Math.floor(Math.random() * availableCoinPlatforms.length)]);
    }
    coinPlatforms.forEach((platform, i) => {
        const coin = new THREE.Mesh(new THREE.TorusGeometry(.28, .09, 10, 18), makeMaterial('#ffd166', .35, .55));
        coin.rotation.x = Math.PI / 2;
        coin.position.set(platform.position.x, platform.position.y + 2.1 + (i % 2) * .35, platform.position.z);
        coin.castShadow = true;
        scene.add(coin);
        gameState.coins.push(coin);
    });
    [-3, 0, 3].forEach((pathZ, index) => {
        const bar = box(1.1, .45, 3.6, 22 + index * 27, sidePathHeight + .8, pathZ, world.accent);
        bar.userData.movingObstacle = true;
        bar.userData.baseZ = pathZ;
        bar.userData.phase = index * 1.7;
        gameState.movingObstacles.push(bar);
    });
    [0, -3, 3].forEach((pathZ, index) => {
        const wall = box(.7, 3.4, 4.8, 34 + index * 25, sidePathHeight + 2.1, pathZ, world.accent);
        wall.userData.baseRotation = index * .5;
        gameState.rotatingWalls.push(wall);
        const enemy = new THREE.Mesh(new THREE.SphereGeometry(.7, 18, 14), makeMaterial('#8f3042', .45, .15));
        enemy.position.set(46 + index * 25, sidePathHeight + .8, pathZ);
        enemy.castShadow = true;
        enemy.userData.baseZ = pathZ;
        enemy.userData.phase = index * 1.25;
        scene.add(enemy);
        gameState.enemies.push(enemy);
        const slowZone = box(8, .08, 2.5, 15 + index * 31, sidePathHeight + .42, pathZ, '#9b78c6');
        slowZone.material.transparent = true;
        slowZone.material.opacity = .38;
        gameState.slowZones.push(slowZone);
    });
    const flag = new THREE.Group(); flag.add(box(.12, 5, .12, layout.goal + 2, 1.3, 0, world.accent)); flag.add(box(3, 1.4, .12, layout.goal + 3.4, 3.1, 0, world.accent)); scene.add(flag);
    loadCharacter();
}
function loadCharacter() { new GLTFLoader().load('./boy.glb', gltf => { player = gltf.scene; player.scale.setScalar(1.55); player.rotation.y = Math.PI / 2; player.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } }); player.position.set(0, -.2, 0); scene.add(player); if (gltf.animations.length) { playerMixer = new THREE.AnimationMixer(player); gltf.animations.forEach(clip => { playerActions[clip.name.toLowerCase()] = playerMixer.clipAction(clip); }); const idleClip = gltf.animations.find(clip => /idle|stand|rest/i.test(clip.name)) || gltf.animations[0]; activePlayerAction = playerMixer.clipAction(idleClip); activePlayerAction.play(); } }, undefined, () => { player = new THREE.Group(); player.add(new THREE.Mesh(new THREE.SphereGeometry(.55, 16, 12), makeMaterial('#172a2a'))); player.add(new THREE.Mesh(new THREE.BoxGeometry(.7, 1.4, .5), makeMaterial('#172a2a'))); player.rotation.y = Math.PI / 2; player.position.set(0, .4, 0); scene.add(player); }); }
function setPlayerAnimation(moving) { if (!playerMixer) return; const actionName = Object.keys(playerActions).find(name => /walk|run|move/i.test(name)); const nextAction = moving && actionName ? playerActions[actionName] : Object.keys(playerActions).find(name => /idle|stand|rest/i.test(name)) ? playerActions[Object.keys(playerActions).find(name => /idle|stand|rest/i.test(name))] : activePlayerAction; if (!nextAction || nextAction === activePlayerAction) return; activePlayerAction?.fadeOut(.16); nextAction.reset().fadeIn(.16).play(); activePlayerAction = nextAction; }
function startGame() { cancelAnimationFrame(animationFrame); createRenderer(); message.classList.add('hidden'); const level = Number(localStorage.getItem('finish-line.selected-stage')) || 1; document.querySelector('#topbar-copy').textContent = `Track ${String(level).padStart(2, '0')} · ${level <= 3 ? 'Active world' : 'New challenge'}`; document.querySelector('#attempt-value').textContent = String(attempt).padStart(2, '0'); playerMixer = null; playerActions = {}; activePlayerAction = null; gameState = { x: 0, y: 3.95, z: 0, vx: 0, vy: 0, vz: 0, grounded: true, jumpLock: false, jumpCharging: false, jumpChargeTime: 0, over: false, rocks: [], platforms: [], coins: [], movingObstacles: [], rotatingWalls: [], enemies: [], slowZones: [], clouds: [], blinkers: [], collectedCoins: 0, goal: 119, level }; document.querySelector('#level-coins').textContent = '0'; document.querySelector('#level-best').textContent = `${Number(localStorage.getItem(`finish-line.best.${level}`)) || 0}%`; document.querySelector('#jump-charge-bar').style.width = '0%'; buildWorld(); clock = new THREE.Clock(); resize(); animationFrame = requestAnimationFrame(loop); }
function resize() { const width = canvas.clientWidth, height = canvas.clientHeight; if (!width || !height) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize);
function loop() { const dt = Math.min(clock.getDelta(), .04); if (!gameState.over) { update(dt); if (playerMixer) playerMixer.update(dt); render(); animationFrame = requestAnimationFrame(loop); } }
function update(dt) {
    const sideRight = keys.has('ArrowRight') || keys.has('KeyD'), sideLeft = keys.has('ArrowLeft') || keys.has('KeyA'), forward = keys.has('ArrowUp') || keys.has('KeyW'), backward = keys.has('ArrowDown') || keys.has('KeyS'), jump = keys.has('Space');
    gameState.vx += (forward ? 16 : backward ? -13 : 0) * dt; gameState.vx *= Math.pow(.02, dt); gameState.vx = THREE.MathUtils.clamp(gameState.vx, -7, 11); gameState.vz += (sideRight ? 12 : sideLeft ? -12 : 0) * dt; gameState.vz *= Math.pow(.03, dt); gameState.vz = THREE.MathUtils.clamp(gameState.vz, -8, 8); gameState.x += gameState.vx * dt; gameState.z += gameState.vz * dt; setPlayerAnimation(Math.abs(gameState.vx) + Math.abs(gameState.vz) > .35); if (jump && gameState.grounded && !gameState.jumpCharging) { gameState.jumpCharging = true; gameState.jumpChargeTime = 0; gameState.vy = 0; } if (gameState.jumpCharging && jump) { gameState.jumpChargeTime = Math.min(1, gameState.jumpChargeTime + dt); document.querySelector('#jump-charge-bar').style.width = `${gameState.jumpChargeTime * 100}%`; } if (!jump && gameState.jumpCharging) { gameState.vy = 12 + gameState.jumpChargeTime * 14; playJump(); gameState.grounded = false; gameState.jumpCharging = false; gameState.jumpChargeTime = 0; document.querySelector('#jump-charge-bar').style.width = '0%'; } gameState.vy -= gameState.jumpCharging ? 0 : 23 * dt; gameState.y += gameState.jumpCharging ? 0 : gameState.vy * dt; if (!gameState.jumpCharging) gameState.grounded = false;
    const wasCharging = gameState.jumpCharging;
    gameState.grounded = false;
    gameState.platforms.forEach(platform => { const edge = platform.userData.width / 2, depth = platform.userData.depth / 2; if (platform.userData.falling && platform.userData.drop) { platform.userData.drop += 8 * dt; platform.position.y -= platform.userData.drop * dt; } if (gameState.x > platform.position.x - edge && gameState.x < platform.position.x + edge && Math.abs(gameState.z - platform.position.z) < depth + .6 && gameState.y <= platform.position.y + 1.05 && gameState.y >= platform.position.y - 1.5 && gameState.vy <= 0) { gameState.y = platform.position.y + .95; gameState.vy = 0; gameState.grounded = true; if (platform.userData.falling) platform.userData.drop = .1; } });
    if (wasCharging && !gameState.grounded) lose();
    const slowZoneActive = gameState.slowZones.some(zone => Math.abs(zone.position.x - gameState.x) < zone.userData.width / 2 && Math.abs(zone.position.z - gameState.z) < zone.userData.depth / 2 + .5);
    const movementFactor = slowZoneActive ? .42 : 1;
    gameState.x += gameState.vx * dt * (movementFactor - 1);
    gameState.z += gameState.vz * dt * (movementFactor - 1);
    gameState.movingObstacles.forEach(obstacle => { obstacle.position.z = obstacle.userData.baseZ + Math.sin(clock.elapsedTime * 1.8 + obstacle.userData.phase) * 2.1; });
    gameState.rocks.forEach(rock => { if (rock.userData.movingRock) rock.position.z = rock.userData.baseZ + Math.sin(clock.elapsedTime * 2 + rock.userData.phase) * 1.8; });
    gameState.rotatingWalls.forEach((wall, index) => { wall.rotation.y = clock.elapsedTime * (index % 2 ? -1.5 : 1.5) + wall.userData.baseRotation; });
    gameState.enemies.forEach(enemy => { enemy.position.z = enemy.userData.baseZ + Math.sin(clock.elapsedTime * 2.4 + enemy.userData.phase) * 2.4; });
    gameState.clouds.forEach(cloud => { cloud.position.x += cloud.userData.speed * dt; if (cloud.position.x > gameState.goal + 25) cloud.position.x = -25; });
    gameState.blinkers.forEach(light => { light.material.emissiveIntensity = .35 + .65 * Math.abs(Math.sin(clock.elapsedTime * 2.2 + light.userData.phase)); });
    gameState.coins.forEach(coin => { coin.rotation.z += dt * 4; if (!coin.visible) return; if (Math.abs(coin.position.x - gameState.x) < 1.25 && Math.abs(coin.position.y - gameState.y) < 1.4 && Math.abs(coin.position.z - gameState.z) < 1.3) { coin.visible = false; gameState.collectedCoins += 1; localStorage.setItem('finish-line.coins', String((Number(localStorage.getItem('finish-line.coins')) || 0) + 1)); playCoin(); document.querySelector('#level-coins').textContent = String(gameState.collectedCoins); } });
    const hitRock = gameState.rocks.some(rock => Math.abs(rock.position.x - gameState.x) < 1.1 && Math.abs(rock.position.y - gameState.y) < 1.5 && Math.abs(rock.position.z - gameState.z) < 1.5);
    const hitMovingObstacle = gameState.movingObstacles.some(obstacle => Math.abs(obstacle.position.x - gameState.x) < 1.1 && Math.abs(obstacle.position.y - gameState.y) < 1.5 && Math.abs(obstacle.position.z - gameState.z) < 2);
    const hitWall = gameState.rotatingWalls.some(wall => Math.abs(wall.position.x - gameState.x) < 1.2 && Math.abs(wall.position.y - gameState.y) < 2 && Math.abs(wall.position.z - gameState.z) < 2.2);
    const hitEnemy = gameState.enemies.some(enemy => Math.abs(enemy.position.x - gameState.x) < 1.2 && Math.abs(enemy.position.y - gameState.y) < 1.4 && Math.abs(enemy.position.z - gameState.z) < 1.4);
    if (gameState.y < -1 || hitRock || hitMovingObstacle || hitWall || hitEnemy) lose(); if (gameState.x >= gameState.goal) win(); if (player) { player.position.set(gameState.x, gameState.y, gameState.z); player.rotation.y = Math.PI / 2 + gameState.vx * .04; } const percent = Math.min(100, Math.max(0, Math.round((gameState.x / gameState.goal) * 100))); const bestKey = `finish-line.best.${gameState.level}`; if (percent > (Number(localStorage.getItem(bestKey)) || 0)) { localStorage.setItem(bestKey, String(percent)); document.querySelector('#level-best').textContent = `${percent}%`; } progressBar.style.width = `${percent}%`; distanceValue.textContent = `${percent}%`;     const cameraHeight = Math.max(15, gameState.y + 13); const cameraBehindOffset = 2; camera.position.x += ((gameState.x - cameraBehindOffset) - camera.position.x) * .16; camera.position.y += (cameraHeight - camera.position.y) * .12; camera.position.z += (gameState.z - camera.position.z) * .16; camera.lookAt(gameState.x + 5, Math.max(1.5, gameState.y - 1), gameState.z);
}
function spawnEmberBurst(x, y, z, count) {
    const colors = ['#ffcf5c', '#ff9a3d', '#ff5c3d', '#ff2e2e'];
    const embers = [];
    for (let i = 0; i < count; i++) {
        const color = colors[i % colors.length];
        const ember = new THREE.Mesh(new THREE.SphereGeometry(.07 + Math.random() * .13, 6, 5), makeMaterial(color, .4, .1));
        ember.material.emissive = new THREE.Color(color);
        ember.material.emissiveIntensity = 1.6;
        ember.material.transparent = true;
        ember.position.set(x, y + .3, z);
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 6;
        ember.userData.velocity = new THREE.Vector3(Math.cos(angle) * speed, 4.5 + Math.random() * 6, Math.sin(angle) * speed);
        scene.add(ember);
        embers.push(ember);
    }
    return embers;
}
function runDeathEffect(x, y, z, onDone) {
    const embers = spawnEmberBurst(x, y, z, 24);
    const fireball = new THREE.Mesh(new THREE.SphereGeometry(.45, 16, 12), makeMaterial('#ff8a3d', .3, .1));
    fireball.material.emissive = new THREE.Color('#ff5522');
    fireball.material.emissiveIntensity = 2.1;
    fireball.material.transparent = true;
    fireball.material.opacity = .85;
    fireball.position.set(x, y + .3, z);
    scene.add(fireball);
    const smokePuffs = [];
    for (let i = 0; i < 7; i++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(.28 + Math.random() * .3, 8, 6), makeMaterial('#2b2620', .9, 0));
        puff.material.transparent = true;
        puff.material.opacity = .55;
        puff.position.set(x + (Math.random() - .5) * .7, y + .2 + Math.random() * .3, z + (Math.random() - .5) * .7);
        puff.userData.rise = .7 + Math.random() * .7;
        scene.add(puff);
        smokePuffs.push(puff);
    }
    const flash = new THREE.PointLight('#ff7a3d', 7, 15, 2);
    flash.position.set(x, y + 1, z);
    scene.add(flash);
    const shakeOrigin = camera.position.clone();
    const duration = .8;
    let elapsed = 0;
    function tick() {
        const dt = Math.min(clock.getDelta(), .05);
        elapsed += dt;
        const t = Math.min(1, elapsed / duration);
        embers.forEach(ember => {
            ember.userData.velocity.y -= 14 * dt;
            ember.position.addScaledVector(ember.userData.velocity, dt);
            ember.material.opacity = 1 - t;
            ember.scale.setScalar(1 - t * .5);
        });
        fireball.scale.setScalar(1 + t * 5.5);
        fireball.material.opacity = Math.max(0, .85 - t * 1.15);
        smokePuffs.forEach(puff => {
            puff.position.y += puff.userData.rise * dt;
            puff.material.opacity = Math.max(0, .55 - t * .6);
            puff.scale.setScalar(1 + t * 1.3);
        });
        flash.intensity = Math.max(0, 7 * (1 - t * 1.7));
        const shake = (1 - t) * .12;
        camera.position.set(shakeOrigin.x + (Math.random() - .5) * shake, shakeOrigin.y + (Math.random() - .5) * shake, shakeOrigin.z + (Math.random() - .5) * shake);
        renderer.render(scene, camera);
        if (t < 1) {
            requestAnimationFrame(tick);
        } else {
            [...embers, ...smokePuffs, fireball, flash].forEach(obj => scene.remove(obj));
            camera.position.copy(shakeOrigin);
            onDone();
        }
    }
    tick();
}
function render() { renderer.render(scene, camera); }
function lose() {
    if (gameState.over) return;
    gameState.over = true;
    playLose();
    if (player) player.visible = false;
    messageKicker.textContent = 'The track won this time';
    messageTitle.textContent = 'The lava was faster.';
    attempt++;
    runDeathEffect(gameState.x, gameState.y, gameState.z, () => message.classList.remove('hidden'));
}

async function win() {
    if (gameState.over) return;
    gameState.over = true;
    localStorage.setItem(`finish-line.stage-${gameState.level}-complete`, 'true');
    if (gameState.level === 1) localStorage.setItem('finish-line.stage-one-complete', 'true');
    if (gameState.level === 2) localStorage.setItem('finish-line.stage-two-complete', 'true');
    if (gameState.level === 3) localStorage.setItem('finish-line.stage-three-complete', 'true');
    playWin();
    await loadHomePage();
}
if (localStorage.getItem('finish-line.skip-intro') === 'true') {
    localStorage.removeItem('finish-line.skip-intro');
    showScreen('game');
} else {
    showScreen('intro');
}