import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';
import { isMuted, startMusic, stopMusic, toggleMute } from './audio.js';
import { applyTranslations, initSettings, onLanguageChange, t } from './i18n.js';

// CrazyGames SDK Integration
let crazyGamesSDK = null;
let isCrazyGamesPlatform = false;
let sdkInitialized = false;

// Initialize CrazyGames SDK
function initCrazyGamesSDK() {
    if (typeof CrazyGames !== 'undefined') {
        try {
            crazyGamesSDK = CrazyGames.SDK;
            crazyGamesSDK.init().then(() => {
                console.log('CrazyGames SDK initialized successfully in home');
                isCrazyGamesPlatform = true;
                sdkInitialized = true;
            }).catch((error) => {
                console.error('Failed to initialize CrazyGames SDK in home:', error);
                sdkInitialized = false;
            });
        } catch (error) {
            console.error('Error initializing CrazyGames SDK in home:', error);
            sdkInitialized = false;
        }
    } else {
        console.log('CrazyGames SDK not available in home');
        sdkInitialized = false;
    }
}

// Rewarded Ad Function (for watch ad button)
// Uses the real CrazyGames v3 API: SDK.ad.requestAd(type, callbacks) — there is
// no ad.showAd method on the SDK, so that call never actually requested an ad.
function showRewardedAdForCoins() {
    if (!(isCrazyGamesPlatform && crazyGamesSDK && sdkInitialized && crazyGamesSDK.ad && typeof crazyGamesSDK.ad.requestAd === 'function')) {
        return Promise.resolve(false);
    }
    return new Promise(resolve => {
        let settled = false;
        crazyGamesSDK.ad.requestAd('rewarded', {
            adStarted: () => {
                // Required by CrazyGames: mute/pause our own audio while their ad plays.
                stopMusic();
            },
            adFinished: () => {
                if (settled) return;
                settled = true;
                console.log('Rewarded ad completed in home');
                startMusic('home');
                resolve(true);
            },
            adError: error => {
                if (settled) return;
                settled = true;
                // Fires for real errors and for unfilled/adblocked requests alike.
                console.warn('Rewarded ad not completed in home:', error);
                startMusic('home');
                resolve(false);
            },
        });
    });
}

// Simplified data saving function (always uses localStorage)
function saveGameDataToStorage(data) {
    localStorage.setItem('finish-line.coins', String(data.coins));
    localStorage.setItem('finish-line.selected-skin', data.selectedSkin);
    localStorage.setItem('finish-line.owned-skins', JSON.stringify(data.ownedSkins));
}

function getCompletedStages() {
    const completed = [];
    for (let i = 1; i <= 33; i++) {
        if (localStorage.getItem(`finish-line.stage-${i}-complete`) === 'true') {
            completed.push(i);
        }
    }
    return completed;
}

const loader = new GLTFLoader();
const nextStageButton = document.querySelector('#next-stage-button');
const navItems = [...document.querySelectorAll('.nav-item')];
const skinsModal = document.querySelector('#skins-modal');
const closeSkinsModalButton = document.querySelector('#close-skins-modal');
const prevSkinButton = document.querySelector('#prev-skin');
const nextSkinButton = document.querySelector('#next-skin');
const buySkinButton = document.querySelector('#buy-skin-button');
const equipSkinButton = document.querySelector('#equip-skin-button');
const watchAdButton = document.querySelector('#watch-ad-button');
const skinNameDisplay = document.querySelector('#skin-name-display');
const skinPriceValue = document.querySelector('#skin-price-value');
const skinsModelViewer = document.querySelector('#skins-model-viewer');
const coinTotalHeader = document.querySelector('#coin-total-header');
const COINS_STORAGE_KEY = 'finish-line.coins';
const SKIN_STORAGE_KEY = 'finish-line.selected-skin';
const OWNED_SKINS_KEY = 'finish-line.owned-skins';
const SKIN_FILE_STORAGE_KEY = 'finish-line.selected-skin-file';
const SKINS = [
    { id: 'default', file: 'boy.glb', price: 0, nameKey: 'skin.default.name' },
    { id: 'shoo', file: 'boyshoo.glb', price: 150, nameKey: 'skin.shoo.name' },
    { id: 'pants', file: 'boypants.glb', price: 200, nameKey: 'skin.pants.name' },
    { id: 'colors', file: 'boycolers.glb', price: 250, nameKey: 'skin.colors.name' },
    { id: 'colorAll', file: 'boycolerAll.glb', price: 350, nameKey: 'skin.colorAll.name' },
];

function getOwnedSkins() {
    try {
        const stored = JSON.parse(localStorage.getItem(OWNED_SKINS_KEY) || '[]');
        return Array.isArray(stored) ? stored : [];
    } catch {
        return [];
    }
}

function getSelectedSkin() {
    const id = localStorage.getItem(SKIN_STORAGE_KEY) || 'default';
    return SKINS.find(skin => skin.id === id) || SKINS[0];
}

function buySkin(skin) {
    if (rewardTotal < skin.price) return;
    rewardTotal -= skin.price;
    localStorage.setItem(COINS_STORAGE_KEY, String(rewardTotal));
    const owned = getOwnedSkins();
    owned.push(skin.id);
    localStorage.setItem(OWNED_SKINS_KEY, JSON.stringify(owned));
    localStorage.setItem(SKIN_STORAGE_KEY, skin.id);
    localStorage.setItem(SKIN_FILE_STORAGE_KEY, skin.file);
    updateCoinTotal();
    refreshHeroModel();
    
    // Save game data to storage
    saveGameDataToStorage({
        coins: rewardTotal,
        selectedSkin: skin.id,
        ownedSkins: owned,
        completedStages: getCompletedStages()
    });
}

function selectSkin(id) {
    localStorage.setItem(SKIN_STORAGE_KEY, id);
    const skin = SKINS.find(item => item.id === id);
    if (skin) localStorage.setItem(SKIN_FILE_STORAGE_KEY, skin.file);
    refreshHeroModel();
    
    // Save game data to storage
    saveGameDataToStorage({
        coins: rewardTotal,
        selectedSkin: id,
        ownedSkins: getOwnedSkins(),
        completedStages: getCompletedStages()
    });
}

let rewardTotal = Number(localStorage.getItem(COINS_STORAGE_KEY)) || 0;
const SELECTED_STAGE_KEY = 'finish-line.selected-stage';
const TOTAL_STAGES = 33;

function updateCoinTotal() {
    if (coinTotalHeader) {
        coinTotalHeader.textContent = rewardTotal;
    }
}

function isStageComplete(stage) {
    return localStorage.getItem(`finish-line.stage-${stage}-complete`) === 'true'
        || (stage === 1 && localStorage.getItem('finish-line.stage-one-complete') === 'true')
        || (stage === 2 && localStorage.getItem('finish-line.stage-two-complete') === 'true')
        || (stage === 3 && localStorage.getItem('finish-line.stage-three-complete') === 'true');
}

function updateMuteButton(button) {
    const muted = isMuted();
    button.textContent = muted ? '🔇' : '🔊';
    button.setAttribute('aria-label', muted ? t('audio.unmute') : t('audio.mute'));
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
        card.innerHTML = `<span>${String(stage).padStart(2, '0')}</span><b>${stageName(stage)}</b><small>${complete ? t('stage.completed') : unlocked ? t('stage.ready') : t('stage.locked')}</small>`;
        track.appendChild(card);
    }
    const complete = isStageComplete(1);
    const statusCopy = document.querySelector('#stage-status-copy');
    const statusMark = document.querySelector('#stage-status-mark');
    statusCopy.textContent = firstOpen === 1 ? t('home.firstStageReady') : t('stage.readyN', { n: firstOpen });
    statusMark.textContent = firstOpen === TOTAL_STAGES && isStageComplete(TOTAL_STAGES) ? '✓' : '→';
    track.querySelectorAll('.stage-card').forEach(card => card.addEventListener('click', () => {
        if (card.classList.contains('locked')) return;
        localStorage.setItem(SELECTED_STAGE_KEY, card.dataset.stage);
        startNextStage();
    }));
}

function stageName(stage) {
    if (stage <= 3) return t(`stage.${stage}.name`);
    return t('stage.generic', { n: String(stage).padStart(2, '0') });
}

navItems.forEach(item => item.addEventListener('click', () => { 
    if (item.dataset.screen === 'home-view') {
        // Handle home view
    }
}));
async function startNextStage() {
    startMusic('home');
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



let currentSkinIndex = 0;
let skinsModalViewer = null;

function openSkinsModal() {
    currentSkinIndex = 0;
    updateSkinsModal();
    skinsModal.hidden = false;
    if (!skinsModalViewer) {
        skinsModalViewer = makeModelViewer(skinsModelViewer, 1.2);
    }
}

function closeSkinsModal() {
    skinsModal.hidden = true;
}

function updateSkinsModal() {
    if (!skinNameDisplay || !skinPriceValue) return;
    
    const skin = SKINS[currentSkinIndex];
    const owned = new Set(['default', ...getOwnedSkins()]);
    const selectedId = getSelectedSkin().id;
    const isOwned = owned.has(skin.id);
    const isSelected = skin.id === selectedId;
    
    skinNameDisplay.textContent = t(skin.nameKey);
    skinPriceValue.textContent = skin.price;
    
    if (isSelected) {
        buySkinButton.hidden = true;
        equipSkinButton.hidden = true;
        watchAdButton.hidden = true;
    } else if (isOwned) {
        buySkinButton.hidden = true;
        equipSkinButton.hidden = false;
        watchAdButton.hidden = true;
    } else {
        buySkinButton.hidden = false;
        equipSkinButton.hidden = true;
        if (rewardTotal < skin.price) {
            buySkinButton.disabled = true;
            watchAdButton.hidden = false;
        } else {
            buySkinButton.disabled = false;
            watchAdButton.hidden = true;
        }
    }
    
    if (skinsModalViewer) {
        skinsModalViewer.setSkin(skin.file);
    }
}

function nextSkin() {
    currentSkinIndex = (currentSkinIndex + 1) % SKINS.length;
    updateSkinsModal();
}

function prevSkin() {
    currentSkinIndex = (currentSkinIndex - 1 + SKINS.length) % SKINS.length;
    updateSkinsModal();
}

function buySkinFromModal() {
    const skin = SKINS[currentSkinIndex];
    if (rewardTotal < skin.price) return;
    buySkin(skin);
    updateSkinsModal();
}

function equipSkinFromModal() {
    const skin = SKINS[currentSkinIndex];
    selectSkin(skin.id);
    updateSkinsModal();
}

async function watchAdForCoins() {
    const adCompleted = await showRewardedAdForCoins();
    if (adCompleted) {
        const adReward = 100;
        rewardTotal += adReward;
        localStorage.setItem(COINS_STORAGE_KEY, String(rewardTotal));
        updateCoinTotal();
        updateSkinsModal();
        
        // Save game data to storage
        saveGameDataToStorage({
            coins: rewardTotal,
            selectedSkin: getSelectedSkin().id,
            ownedSkins: getOwnedSkins(),
            completedStages: getCompletedStages()
        });
    }
}

closeSkinsModalButton.addEventListener('click', closeSkinsModal);
prevSkinButton.addEventListener('click', prevSkin);
nextSkinButton.addEventListener('click', nextSkin);
buySkinButton.addEventListener('click', buySkinFromModal);
equipSkinButton.addEventListener('click', equipSkinFromModal);
watchAdButton.addEventListener('click', watchAdForCoins);
skinsModal.addEventListener('click', event => { if (event.target === skinsModal) closeSkinsModal(); });

// Modify the skins view click to open modal instead
const skinsNavItem = document.querySelector('[data-screen="skins-view"]');
if (skinsNavItem) {
    skinsNavItem.addEventListener('click', (e) => {
        e.preventDefault();
        openSkinsModal();
    });
}

let heroViewer = null;

function refreshHeroModel() {
    heroViewer?.setSkin(getSelectedSkin().file);
}

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

    let currentModel = null;
    let mixer = null;
    const clock = new THREE.Clock();

    function loadModel(file) {
        loader.load(`./${file}`, gltf => {
            if (currentModel) scene.remove(currentModel);
            const model = gltf.scene;
            model.scale.setScalar(scale);
            model.position.y = -.65;
            model.traverse(node => { if (node.isMesh) node.castShadow = true; });
            scene.add(model);
            currentModel = model;
            mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
            if (mixer) mixer.clipAction(gltf.animations[0]).play();
        }, undefined, () => {
            if (currentModel) scene.remove(currentModel);
            const fallback = new THREE.Group();
            const material = new THREE.MeshStandardMaterial({ color: '#172a2a' });
            const head = new THREE.Mesh(new THREE.SphereGeometry(.48, 20, 16), material);
            head.position.y = 1.4;
            const body = new THREE.Mesh(new THREE.CapsuleGeometry(.35, 1.1, 8, 16), material);
            body.position.y = .45;
            fallback.add(head, body);
            scene.add(fallback);
            currentModel = fallback;
            mixer = null;
        });
    }

    const animate = () => {
        const delta = clock.getDelta();
        if (mixer) mixer.update(delta);
        if (currentModel) currentModel.rotation.y += delta * .35;
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    };
    animate();
    loadModel(getSelectedSkin().file);

    const resize = () => {
        const width = Math.max(1, container.clientWidth);
        const height = Math.max(1, container.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    return { setSkin: loadModel };
}

heroViewer = makeModelViewer(document.querySelector('#hero-model'), 1.35);
startMusic('home');
applyTranslations();
initSettings();
initCrazyGamesSDK();
updateCoinTotal();
onLanguageChange(() => { updateStageState(); updateMuteButton(muteButton); updateSkinsModal(); });