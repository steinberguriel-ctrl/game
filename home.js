import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';
import { isMuted, playCoin, startMusic, toggleMute } from './audio.js';

const loader = new GLTFLoader();
const views = [...document.querySelectorAll('.view')];
const navItems = [...document.querySelectorAll('.nav-item')];
const nextStageButton = document.querySelector('#next-stage-button');
const coinBagButton = document.querySelector('#coin-bag-button');
const coinRewardModal = document.querySelector('#coin-reward-modal');
const closeRewardButton = document.querySelector('#close-reward');
const collectRewardButton = document.querySelector('#collect-reward');
const rewardValue = document.querySelector('#reward-value');
const rewardProgress = document.querySelector('#reward-progress');
const coinTotal = document.querySelector('#coin-total');
const coinTotalHeader = document.querySelector('#coin-total-header');
const COINS_STORAGE_KEY = 'finish-line.coins';
let rewardOpeningsLeft = 0;
let rewardTotal = Number(localStorage.getItem(COINS_STORAGE_KEY)) || 0;
const SELECTED_STAGE_KEY = 'finish-line.selected-stage';
const TOTAL_STAGES = 33;

function isStageComplete(stage) {
    return localStorage.getItem(`finish-line.stage-${stage}-complete`) === 'true'
        || (stage === 1 && localStorage.getItem('finish-line.stage-one-complete') === 'true')
        || (stage === 2 && localStorage.getItem('finish-line.stage-two-complete') === 'true')
        || (stage === 3 && localStorage.getItem('finish-line.stage-three-complete') === 'true');
}

function updateMuteButton(button) {
    const muted = isMuted();
    button.textContent = muted ? '🔇' : '🔊';
    button.setAttribute('aria-label', muted ? 'Unmute music' : 'Mute music');
}

function updateStageState() {
    const track = document.querySelector('#stage-track');
    const firstOpen = Array.from({ length: TOTAL_STAGES }, (_, index) => index + 1).find(stage => !isStageComplete(stage)) || TOTAL_STAGES;
    track.innerHTML = '';
    for (let stage = 1; stage <= TOTAL_STAGES; stage += 1) {
        const card = document.createElement('button');
        const complete = isStageComplete(stage);
        const unlocked = stage === 1 || isStageComplete(stage - 1);
        card.type = 'button';
        card.dataset.stage = String(stage);
        card.className = `stage-card ${complete ? 'completed' : unlocked ? 'next' : 'locked'}`;
        card.innerHTML = `<span>${String(stage).padStart(2, '0')}</span><b>${stageName(stage)}</b><small>${complete ? 'Completed ✓' : unlocked ? 'Ready to play' : 'Locked'}</small>`;
        track.appendChild(card);
    }
    const complete = isStageComplete(1);
    const statusCopy = document.querySelector('#stage-status-copy');
    const statusMark = document.querySelector('#stage-status-mark');
    statusCopy.textContent = firstOpen === 1 ? 'The first stage is ready' : `Stage ${firstOpen} is ready`;
    statusMark.textContent = firstOpen === TOTAL_STAGES && isStageComplete(TOTAL_STAGES) ? '✓' : '→';
    track.querySelectorAll('.stage-card').forEach(card => card.addEventListener('click', () => {
        if (card.classList.contains('locked')) return;
        localStorage.setItem(SELECTED_STAGE_KEY, card.dataset.stage);
        startNextStage();
    }));
}

function stageName(stage) {
    if (stage === 1) return 'Survival';
    if (stage === 2) return 'Sky City';
    if (stage === 3) return 'Crystal Cave';
    return `Track ${String(stage).padStart(2, '0')}`;
}

function showView(id) {
    views.forEach(view => view.classList.toggle('active-view', view.id === id));
    navItems.forEach(item => item.classList.toggle('active', item.dataset.screen === id));
}
navItems.forEach(item => item.addEventListener('click', () => { if (item.dataset.screen) showView(item.dataset.screen); }));
async function startNextStage() {
    startMusic();
    localStorage.setItem(SELECTED_STAGE_KEY, localStorage.getItem(SELECTED_STAGE_KEY) || '1');
    localStorage.setItem('finish-line.skip-intro', 'true');
    const response = await fetch('index.html');
    const gameDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
    document.title = gameDocument.title;
    document.body.innerHTML = gameDocument.body.innerHTML;
    document.body.querySelectorAll('script').forEach(script => script.remove());
    document.querySelectorAll('link[data-runtime-style]').forEach(style => style.remove());
    ['style.css', 'mobile-fix.css'].forEach(href => {
        const style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = href;
        style.dataset.runtimeStyle = 'true';
        document.head.appendChild(style);
    });
    await import(`./game.js?level=${Date.now()}`);
}

nextStageButton.addEventListener('click', () => {
    const nextStage = Array.from({ length: TOTAL_STAGES }, (_, index) => index + 1)
        .find(stage => !isStageComplete(stage)) || TOTAL_STAGES;
    localStorage.setItem(SELECTED_STAGE_KEY, nextStage);
    startNextStage();
});
updateStageState();
const muteButton = document.querySelector('.mute-button');
updateMuteButton(muteButton);
muteButton.addEventListener('click', () => { toggleMute(); updateMuteButton(muteButton); });

function updateCoinTotal() {
    coinTotal.textContent = `${rewardTotal} coins`;
    coinTotalHeader.textContent = rewardTotal;
}

function closeReward() {
    coinRewardModal.hidden = true;
    document.querySelector('.coin-reward-box').classList.remove('reward-done');
}

function openCoinBag() {
    rewardOpeningsLeft = 2 + Math.floor(Math.random() * 4);
    rewardValue.textContent = 'You got: 0';
    rewardProgress.textContent = `${rewardOpeningsLeft} openings left`;
    collectRewardButton.disabled = false;
    collectRewardButton.textContent = 'Collect coins';
    coinRewardModal.hidden = false;
}

function collectCoins() {
    if (rewardOpeningsLeft < 1) return;
    const amount = [50, 75, 100][Math.floor(Math.random() * 3)];
    playCoin();
    rewardTotal += amount;
    rewardOpeningsLeft -= 1;
    localStorage.setItem(COINS_STORAGE_KEY, String(rewardTotal));
    updateCoinTotal();
    rewardValue.textContent = `You got: ${amount}`;
    if (rewardOpeningsLeft) {
        rewardProgress.textContent = `${rewardOpeningsLeft} openings left`;
    } else {
        rewardProgress.textContent = 'The bag is empty. Come back after the next track.';
        collectRewardButton.disabled = true;
        collectRewardButton.textContent = 'Collected';
        document.querySelector('.coin-reward-box').classList.add('reward-done');
    }
}

coinBagButton.addEventListener('click', openCoinBag);
collectRewardButton.addEventListener('click', collectCoins);
closeRewardButton.addEventListener('click', closeReward);
coinRewardModal.addEventListener('click', event => { if (event.target === coinRewardModal) closeReward(); });
updateCoinTotal();

function makeModelViewer(container, scale = 1.55) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, .1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0, 0);
    container.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight('#fff4d3', '#356c72', 2.4));
    const light = new THREE.DirectionalLight('#fff0c2', 3);
    light.position.set(-3, 6, 5);
    scene.add(light);
    camera.position.set(0, 1.35, 6);
    camera.lookAt(0, 1.15, 0);

    loader.load('./boy.glb', gltf => {
        const model = gltf.scene;
        model.scale.setScalar(scale);
        model.position.y = -.65;
        model.traverse(node => { if (node.isMesh) node.castShadow = true; });
        scene.add(model);
        const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
        if (mixer) mixer.clipAction(gltf.animations[0]).play();
        const clock = new THREE.Clock();
        const animate = () => {
            const delta = clock.getDelta();
            if (mixer) mixer.update(delta);
            model.rotation.y += delta * .35;
            renderer.render(scene, camera);
            requestAnimationFrame(animate);
        };
        animate();
    }, undefined, () => {
        const fallback = new THREE.Group();
        const material = new THREE.MeshStandardMaterial({ color: '#172a2a' });
        const head = new THREE.Mesh(new THREE.SphereGeometry(.48, 20, 16), material);
        head.position.y = 1.4;
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(.35, 1.1, 8, 16), material);
        body.position.y = .45;
        fallback.add(head, body);
        scene.add(fallback);
        renderer.render(scene, camera);
    });

    const resize = () => {
        const width = Math.max(1, container.clientWidth);
        const height = Math.max(1, container.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);
}

makeModelViewer(document.querySelector('#hero-model'), 1.35);