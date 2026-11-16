import { OPPONENTS } from './opponents.js';
import {
  playCountdownTick,
  playHorn,
  playWhoosh,
  playHit,
  playMiss,
  playVictory,
  playDefeat,
} from './audio.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const W = canvas.width;  // 960
const H = canvas.height; // 540

// UI Elements
const hudEl = document.getElementById('hud');
const titleScreen = document.getElementById('title-screen');
const resultScreen = document.getElementById('result-screen');
const startBtn = document.getElementById('start-btn');
const nextBtn = document.getElementById('next-btn');

const playerNameEl = document.getElementById('player-name');
const enemyNameEl = document.getElementById('enemy-name');
const playerHpBar = document.getElementById('player-hp-bar');
const enemyHpBar = document.getElementById('enemy-hp-bar');
const playerJavelinsEl = document.getElementById('player-javelins');
const enemyJavelinsEl = document.getElementById('enemy-javelins');
const roundBadgeEl = document.getElementById('round-badge');
const scoreTextEl = document.getElementById('score-text');

const resultTitleEl = document.getElementById('result-title');
const resultSubtitleEl = document.getElementById('result-subtitle');
const resultStatsEl = document.getElementById('result-stats');

// Ready Zone (bottom-left, like Gunblood's holster)
const READY_ZONE = { x: 24, y: 376, w: 170, h: 140 };

// Duelist positions
const PLAYER_POS = { x: 175, y: 375 };
const ENEMY_POS = { x: 785, y: 375 };

// Game State
let state = 'TITLE'; // TITLE | COUNTDOWN | DUEL | ROUND_OVER
let roundIndex = 0;
let score = 0;
let mouse = { x: W / 2, y: H / 2, inReady: false };

let countdownValue = 3;
let countdownTimer = 0;
let duelStartTime = 0;
let firstShotReactionMs = null;

let player = null;
let enemy = null;
let projectiles = [];
let stuckJavelins = [];
let particles = [];
let floatingTexts = [];
let shakeTime = 0;
let shakeIntensity = 0;

let aiNextThrowTime = 0;
let lastTime = 0;

function createDuelist(isPlayer, config) {
  return {
    isPlayer,
    x: isPlayer ? PLAYER_POS.x : ENEMY_POS.x,
    y: isPlayer ? PLAYER_POS.y : ENEMY_POS.y,
    hp: 100,
    maxHp: 100,
    javelins: 4,
    maxJavelins: 4,
    throwAnim: 0,
    hitFlash: 0,
    dead: false,
    config,
  };
}

function startTournament() {
  roundIndex = 0;
  score = 0;
  titleScreen.classList.add('hidden');
  hudEl.classList.remove('hidden');
  startRound();
}

function startRound() {
  const opp = OPPONENTS[roundIndex];
  player = createDuelist(true, {
    name: 'Sir Rowan',
    tunic: '#235789',
    cape: '#163859',
    armor: '#b0b8c0',
    helmet: 'open',
  });
  enemy = createDuelist(false, opp);

  projectiles = [];
  stuckJavelins = [];
  particles = [];
  floatingTexts = [];
  shakeTime = 0;
  firstShotReactionMs = null;

  countdownValue = 3;
  countdownTimer = 0;
  state = 'COUNTDOWN';

  resultScreen.classList.add('hidden');
  updateHUD();
}

function updateHUD() {
  playerNameEl.textContent = player.config.name;
  enemyNameEl.textContent = `${enemy.config.name} — ${enemy.config.title}`;
  playerHpBar.style.width = `${Math.max(0, player.hp)}%`;
  enemyHpBar.style.width = `${Math.max(0, enemy.hp)}%`;
  roundBadgeEl.textContent = `DUEL ${roundIndex + 1} / ${OPPONENTS.length}`;
  scoreTextEl.textContent = `SCORE: ${score}`;

  renderJavelinRack(playerJavelinsEl, player.javelins, player.maxJavelins);
  renderJavelinRack(enemyJavelinsEl, enemy.javelins, enemy.maxJavelins);
}

function renderJavelinRack(container, current, max) {
  container.innerHTML = '';
  for (let i = 0; i < max; i++) {
    const icon = document.createElement('div');
    icon.className = 'javelin-icon' + (i >= current ? ' used' : '');
    container.appendChild(icon);
  }
}

function getHitboxes(d) {
  const dir = d.isPlayer ? 1 : -1;
  // Relative to d.x, d.y (feet at d.y)
  return {
    head: { x: d.x - 16, y: d.y - 148, w: 32, h: 32 },
    torso: { x: d.x - 22, y: d.y - 114, w: 44, h: 58 },
    legs: { x: d.x - 20 + dir * 2, y: d.y - 56, w: 40, h: 56 },
  };
}

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function throwJavelin(fromDuelist, targetX, targetY) {
  if (fromDuelist.javelins <= 0 || fromDuelist.dead) return;
  fromDuelist.javelins--;
  fromDuelist.throwAnim = 0.25;
  playWhoosh();
  updateHUD();

  const startX = fromDuelist.x + (fromDuelist.isPlayer ? 22 : -22);
  const startY = fromDuelist.y - 98;
  const dx = targetX - startX;
  const dy = targetY - startY;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = 1350; // px/s

  // Slight gravity compensation so javelin arcs naturally toward cursor
  const flightTime = dist / speed;
  const gravity = 280;
  const vx = (dx / dist) * speed;
  const vy = (dy / dist) * speed - 0.5 * gravity * flightTime;

  projectiles.push({
    owner: fromDuelist.isPlayer ? 'player' : 'enemy',
    x: startX,
    y: startY,
    vx,
    vy,
    gravity,
    angle: Math.atan2(vy, vx),
    trail: [],
  });
}

function spawnParticles(x, y, color, count = 14) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 60 + Math.random() * 220;
    particles.push({
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 60,
      life: 0.4 + Math.random() * 0.35,
      maxLife: 0.75,
      color,
      size: 2 + Math.random() * 3.5,
    });
  }
}

function addFloatingText(x, y, text, color = '#ffd166') {
  floatingTexts.push({ x, y, text, color, life: 1.0 });
}

function triggerShake(intensity = 8, duration = 0.22) {
  shakeIntensity = intensity;
  shakeTime = duration;
}

function endRound(outcome) {
  if (state === 'ROUND_OVER') return;
  state = 'ROUND_OVER';

  let roundScore = 0;
  if (outcome === 'WIN') {
    playVictory();
    const hpBonus = player.hp * 10;
    const javBonus = player.javelins * 150;
    const speedBonus = firstShotReactionMs ? Math.max(0, 1000 - firstShotReactionMs) : 0;
    roundScore = 500 + hpBonus + javBonus + Math.round(speedBonus);
    score += roundScore;
    updateHUD();

    const isFinal = roundIndex === OPPONENTS.length - 1;
    resultTitleEl.textContent = isFinal ? 'TOURNAMENT CHAMPION!' : 'VICTORY!';
    resultSubtitleEl.textContent = isFinal
      ? 'You have defeated every challenger in the realm!'
      : `${enemy.config.name} falls before your javelin.`;
    resultStatsEl.innerHTML = `
      <div>Reaction Time: <strong>${firstShotReactionMs ? firstShotReactionMs + ' ms' : 'N/A'}</strong></div>
      <div>Remaining Health: <strong>${player.hp}%</strong> &bull; Javelins Left: <strong>${player.javelins}</strong></div>
      <div style="margin-top:6px;color:#e8c070;">Round Score: <strong>+${roundScore}</strong></div>
    `;
    nextBtn.textContent = isFinal ? 'PLAY AGAIN' : 'NEXT CHALLENGER';
    nextBtn.onclick = () => {
      if (isFinal) {
        roundIndex = 0;
        score = 0;
      } else {
        roundIndex++;
      }
      startRound();
    };
  } else if (outcome === 'LOSE') {
    playDefeat();
    resultTitleEl.textContent = 'DEFEATED';
    resultSubtitleEl.textContent = `${enemy.config.name} struck you down.`;
    resultStatsEl.innerHTML = `
      <div>Final Score: <strong>${score}</strong></div>
      <div>Reached Duel: <strong>${roundIndex + 1} / ${OPPONENTS.length}</strong></div>
    `;
    nextBtn.textContent = 'RETRY DUEL';
    nextBtn.onclick = () => startRound();
  } else {
    // DRAW
    resultTitleEl.textContent = 'STALEMATE';
    resultSubtitleEl.textContent = 'Both duelists exhausted all 4 javelins!';
    resultStatsEl.innerHTML = `<div>Prepare to duel again.</div>`;
    nextBtn.textContent = 'REMATCH';
    nextBtn.onclick = () => startRound();
  }

  setTimeout(() => {
    resultScreen.classList.remove('hidden');
  }, 650);
}

// Input Handling
function updateMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * W;
  mouse.y = ((e.clientY - rect.top) / rect.height) * H;
  mouse.inReady = pointInRect(mouse.x, mouse.y, READY_ZONE);
}

canvas.addEventListener('mousemove', updateMousePos);
canvas.addEventListener('mousedown', (e) => {
  updateMousePos(e);
  if (state === 'DUEL' && !player.dead && player.javelins > 0) {
    if (firstShotReactionMs === null) {
      firstShotReactionMs = Math.round(performance.now() - duelStartTime);
    }
    throwJavelin(player, mouse.x, mouse.y);
  }
});

startBtn.addEventListener('click', startTournament);

// Main Loop
function update(dt) {
  if (shakeTime > 0) {
    shakeTime = Math.max(0, shakeTime - dt);
  }

  if (state === 'COUNTDOWN') {
    if (mouse.inReady) {
      countdownTimer += dt;
      if (countdownTimer >= 0.95) {
        countdownTimer = 0;
        countdownValue--;
        if (countdownValue > 0) {
          playCountdownTick();
        } else {
          // THROW!
          state = 'DUEL';
          playHorn();
          duelStartTime = performance.now();
          aiNextThrowTime = duelStartTime + enemy.config.reactionMs;
        }
      }
    } else {
      // Reset partial timer if they leave early
      countdownTimer = 0;
    }
  }

  if (state === 'DUEL') {
    const now = performance.now();
    if (!enemy.dead && enemy.javelins > 0 && now >= aiNextThrowTime) {
      // AI aims at player
      const spread = enemy.config.accuracySpread;
      const aimHead = Math.random() < enemy.config.headshotChance;
      const targetY = aimHead ? player.y - 132 : player.y - 86;
      const tx = player.x + (Math.random() * 2 - 1) * spread;
      const ty = targetY + (Math.random() * 2 - 1) * spread;
      throwJavelin(enemy, tx, ty);
      aiNextThrowTime = now + enemy.config.throwIntervalMs;
    }

    // Check stalemate if both out of javelins and no projectiles in air
    if (
      player.javelins === 0 &&
      enemy.javelins === 0 &&
      projectiles.length === 0 &&
      !player.dead &&
      !enemy.dead
    ) {
      endRound('DRAW');
    }
  }

  // Update duelists
  [player, enemy].forEach((d) => {
    if (!d) return;
    if (d.throwAnim > 0) d.throwAnim = Math.max(0, d.throwAnim - dt);
    if (d.hitFlash > 0) d.hitFlash = Math.max(0, d.hitFlash - dt);
  });

  // Update projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 8) p.trail.shift();

    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle = Math.atan2(p.vy, p.vx);

    const target = p.owner === 'player' ? enemy : player;
    let hit = false;

    if (!target.dead) {
      const boxes = getHitboxes(target);
      if (pointInRect(p.x, p.y, boxes.head)) {
        applyHit(target, 100, 'HEADSHOT! -100', p, true);
        hit = true;
      } else if (pointInRect(p.x, p.y, boxes.torso)) {
        applyHit(target, 45, '-45', p, false);
        hit = true;
      } else if (pointInRect(p.x, p.y, boxes.legs)) {
        applyHit(target, 25, '-25', p, false);
        hit = true;
      }
    }

    if (hit) {
      projectiles.splice(i, 1);
      continue;
    }

    // Ground or offscreen
    if (p.y >= 400) {
      playMiss();
      spawnParticles(p.x, 400, '#7a6348', 8);
      stuckJavelins.push({ x: p.x, y: 400, angle: p.angle });
      projectiles.splice(i, 1);
    } else if (p.x < -60 || p.x > W + 60 || p.y > H + 60) {
      projectiles.splice(i, 1);
    }
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.vy += 420 * dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) particles.splice(i, 1);
  }

  // Floating texts
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y -= 36 * dt;
    ft.life -= dt;
    if (ft.life <= 0) floatingTexts.splice(i, 1);
  }
}

function applyHit(target, dmg, label, proj, isHeadshot) {
  target.hp = Math.max(0, target.hp - dmg);
  target.hitFlash = 0.2;
  playHit(isHeadshot);
  triggerShake(isHeadshot ? 14 : 7, isHeadshot ? 0.3 : 0.18);
  spawnParticles(proj.x, proj.y, '#b81d1d', isHeadshot ? 26 : 14);
  addFloatingText(target.x, target.y - 155, label, isHeadshot ? '#ff4d4d' : '#ffd166');
  stuckJavelins.push({ x: proj.x, y: proj.y, angle: proj.angle });
  updateHUD();

  if (target.hp <= 0) {
    target.dead = true;
    endRound(target.isPlayer ? 'LOSE' : 'WIN');
  }
}

// Rendering
function drawBackground() {
  const t = performance.now() * 0.001;

  // Dramatic dusk sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, 380);
  sky.addColorStop(0, '#0f1624');
  sky.addColorStop(0.45, '#2b2433');
  sky.addColorStop(0.8, '#6e3b30');
  sky.addColorStop(1, '#b86b35');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, 380);

  // Soft sunset glow
  const sunGlow = ctx.createRadialGradient(W * 0.5, 340, 20, W * 0.5, 340, 320);
  sunGlow.addColorStop(0, 'rgba(255, 175, 90, 0.35)');
  sunGlow.addColorStop(1, 'rgba(255, 175, 90, 0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, W, 380);

  // Distant mountain ridge
  ctx.fillStyle = '#1d1924';
  ctx.beginPath();
  ctx.moveTo(0, 380);
  ctx.lineTo(0, 260);
  ctx.lineTo(140, 210);
  ctx.lineTo(290, 255);
  ctx.lineTo(480, 195);
  ctx.lineTo(660, 245);
  ctx.lineTo(830, 200);
  ctx.lineTo(W, 240);
  ctx.lineTo(W, 380);
  ctx.closePath();
  ctx.fill();

  // Castle Curtain Wall
  const wallGrad = ctx.createLinearGradient(0, 165, 0, 380);
  wallGrad.addColorStop(0, '#362e2b');
  wallGrad.addColorStop(1, '#211b19');
  ctx.fillStyle = wallGrad;
  ctx.fillRect(110, 175, 740, 205);

  // Subtle stone masonry courses
  ctx.strokeStyle = 'rgba(15, 11, 9, 0.45)';
  ctx.lineWidth = 1;
  for (let row = 185; row < 375; row += 18) {
    ctx.beginPath();
    ctx.moveTo(110, row);
    ctx.lineTo(850, row);
    ctx.stroke();
    const offset = ((row / 18) % 2) * 18;
    for (let col = 128 + offset; col < 840; col += 36) {
      ctx.beginPath();
      ctx.moveTo(col, row);
      ctx.lineTo(col, row + 18);
      ctx.stroke();
    }
  }

  // Battlements (crenellations)
  ctx.fillStyle = '#362e2b';
  for (let x = 110; x < 850; x += 38) {
    ctx.fillRect(x, 155, 22, 22);
    ctx.fillStyle = '#473d38';
    ctx.fillRect(x, 155, 22, 4);
    ctx.fillStyle = '#362e2b';
  }

  // Left & Right Keep Towers
  drawTower(65, 95, 78, 285);
  drawTower(817, 95, 78, 285);

  // Central Gatehouse Arch
  ctx.fillStyle = '#171210';
  ctx.beginPath();
  ctx.moveTo(435, 375);
  ctx.lineTo(435, 275);
  ctx.arc(480, 275, 45, Math.PI, 0);
  ctx.lineTo(525, 375);
  ctx.closePath();
  ctx.fill();
  // Portcullis bars
  ctx.strokeStyle = '#3c3633';
  ctx.lineWidth = 3;
  for (let gx = 447; gx <= 513; gx += 13) {
    ctx.beginPath();
    ctx.moveTo(gx, 240);
    ctx.lineTo(gx, 375);
    ctx.stroke();
  }
  for (let gy = 265; gy <= 355; gy += 22) {
    ctx.beginPath();
    ctx.moveTo(437, gy);
    ctx.lineTo(523, gy);
    ctx.stroke();
  }

  // Fluttering Heraldic Banners
  drawBanner(255, 195, '#7a1c1c', t);
  drawBanner(705, 195, '#1f4e78', t + 1.2);

  // Wall Torches with flickering glow
  drawTorch(355, 245, t);
  drawTorch(605, 245, t + 2.1);

  // Wooden Arena Fence
  ctx.fillStyle = '#3b2818';
  ctx.fillRect(0, 352, W, 6);
  for (let fx = 20; fx < W; fx += 72) {
    ctx.fillStyle = '#4a3320';
    ctx.fillRect(fx, 336, 10, 42);
  }

  // Courtyard Ground (layered mud & cobblestones)
  const ground = ctx.createLinearGradient(0, 375, 0, H);
  ground.addColorStop(0, '#543f2b');
  ground.addColorStop(0.35, '#3b2c1e');
  ground.addColorStop(1, '#211810');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 375, W, H - 375);

  // Ground horizon & subtle ruts
  ctx.strokeStyle = '#73573c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 375);
  ctx.lineTo(W, 375);
  ctx.stroke();

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(W * 0.5, 445, 310, 26, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTower(x, y, w, h) {
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, '#423834');
  grad.addColorStop(0.6, '#2f2724');
  grad.addColorStop(1, '#1e1917');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // Conical slate roof
  ctx.fillStyle = '#242936';
  ctx.beginPath();
  ctx.moveTo(x - 8, y);
  ctx.lineTo(x + w / 2, y - 52);
  ctx.lineTo(x + w + 8, y);
  ctx.closePath();
  ctx.fill();

  // Warm slit window
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(x + w / 2 - 4, y + 48, 8, 22);
}

function drawTorch(x, y, t) {
  const flicker = Math.sin(t * 14) * 3 + Math.cos(t * 23) * 2;
  const glow = ctx.createRadialGradient(x, y - 8, 4, x, y - 8, 52 + flicker);
  glow.addColorStop(0, 'rgba(255, 190, 70, 0.55)');
  glow.addColorStop(0.5, 'rgba(255, 110, 30, 0.18)');
  glow.addColorStop(1, 'rgba(255, 110, 30, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y - 8, 56, 0, Math.PI * 2);
  ctx.fill();

  // Bracket
  ctx.fillStyle = '#1f1b18';
  ctx.fillRect(x - 3, y, 6, 18);

  // Flame
  ctx.fillStyle = '#ff6b1a';
  ctx.beginPath();
  ctx.ellipse(x, y - 7, 6, 11 + flicker * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.ellipse(x, y - 5, 3, 6, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBanner(x, y, color, t) {
  const sway = Math.sin(t * 2.2) * 3;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 16, y);
  ctx.lineTo(x + 16, y);
  ctx.lineTo(x + 16 + sway, y + 70);
  ctx.lineTo(x + sway * 0.6, y + 54);
  ctx.lineTo(x - 16 + sway, y + 70);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Simple gold crest
  ctx.fillStyle = '#d4af37';
  ctx.beginPath();
  ctx.arc(x + sway * 0.3, y + 26, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawDuelist(d) {
  if (!d) return;
  const t = performance.now() * 0.001;
  const breath = d.dead ? 0 : Math.sin(t * 3 + (d.isPlayer ? 0 : 1.5)) * 1.5;

  ctx.save();
  ctx.translate(d.x, d.y);

  if (d.dead) {
    ctx.rotate(d.isPlayer ? -Math.PI / 2.1 : Math.PI / 2.1);
    ctx.translate(0, 25);
  }

  const dir = d.isPlayer ? 1 : -1;
  const flash = d.hitFlash > 0;

  // Ground Shadow
  if (!d.dead) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 30, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Flowing Cape
  ctx.fillStyle = flash ? '#ffffff' : d.config.cape;
  ctx.beginPath();
  ctx.moveTo(-10 * dir, -112 + breath);
  ctx.quadraticCurveTo(-36 * dir, -65, -38 * dir, -14);
  ctx.lineTo(-8 * dir, -16);
  ctx.closePath();
  ctx.fill();

  // Legs & Armored Greaves
  ctx.fillStyle = flash ? '#ffffff' : '#2a2421';
  ctx.fillRect(-15, -56, 12, 56);
  ctx.fillRect(3, -56, 12, 56);
  // Boots
  ctx.fillStyle = flash ? '#ffffff' : '#1b1614';
  ctx.fillRect(-16, -16, 14, 16);
  ctx.fillRect(2, -16, 14, 16);

  // Tunic / Chainmail Skirt
  ctx.fillStyle = flash ? '#ffffff' : d.config.tunic;
  ctx.fillRect(-20, -114 + breath, 40, 62);

  // Leather Belt & Gold Buckle
  ctx.fillStyle = flash ? '#ffffff' : '#3d2514';
  ctx.fillRect(-20, -68 + breath, 40, 7);
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(-4, -69 + breath, 8, 9);

  // Metallic Breastplate with highlight
  if (!flash) {
    const armorGrad = ctx.createLinearGradient(-17, -112, 17, -75);
    armorGrad.addColorStop(0, d.config.armor);
    armorGrad.addColorStop(0.5, '#e2e8f0');
    armorGrad.addColorStop(1, d.config.armor);
    ctx.fillStyle = armorGrad;
  } else {
    ctx.fillStyle = '#ffffff';
  }
  ctx.fillRect(-17, -112 + breath, 34, 36);

  // Shoulder Pauldron
  ctx.beginPath();
  ctx.arc(12 * dir, -106 + breath, 11, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = flash ? '#ffffff' : '#dfb393';
  ctx.beginPath();
  ctx.arc(0, -132 + breath, 15, 0, Math.PI * 2);
  ctx.fill();

  // Eye & Brow
  if (!flash) {
    ctx.fillStyle = '#1e1b18';
    ctx.fillRect(5 * dir, -134 + breath, 4 * dir, 3);
  }

  // Helmet / Crown
  ctx.fillStyle = flash ? '#ffffff' : d.config.armor;
  if (d.config.helmet === 'crown') {
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.moveTo(-14, -142 + breath);
    ctx.lineTo(-14, -157 + breath);
    ctx.lineTo(-6, -149 + breath);
    ctx.lineTo(0, -159 + breath);
    ctx.lineTo(6, -149 + breath);
    ctx.lineTo(14, -157 + breath);
    ctx.lineTo(14, -142 + breath);
    ctx.closePath();
    ctx.fill();
  } else if (d.config.helmet === 'horned') {
    ctx.beginPath();
    ctx.arc(0, -135 + breath, 16, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#dcdcdc';
    ctx.beginPath();
    ctx.moveTo(-12, -144 + breath);
    ctx.lineTo(-24, -163 + breath);
    ctx.lineTo(-6, -148 + breath);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(12, -144 + breath);
    ctx.lineTo(24, -163 + breath);
    ctx.lineTo(6, -148 + breath);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, -135 + breath, 16, Math.PI, 0);
    ctx.fill();
  }

  // Throwing Arm & Held Javelin
  const armAngle = d.throwAnim > 0 ? -0.65 * dir : 0.22 * dir;
  ctx.save();
  ctx.translate(10 * dir, -100 + breath);
  ctx.rotate(armAngle);
  ctx.fillStyle = flash ? '#ffffff' : d.config.armor;
  ctx.fillRect(-4, -4, 24 * dir, 9);

  if (d.javelins > 0 && !d.dead) {
    drawJavelin(18 * dir, 0, dir === 1 ? 0 : Math.PI);
  }
  ctx.restore();

  ctx.restore();
}

function drawJavelin(x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Ash-wood shaft
  ctx.strokeStyle = '#8c5a32';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-36, 0);
  ctx.lineTo(14, 0);
  ctx.stroke();

  // Leather grip wrap
  ctx.strokeStyle = '#3d2210';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.lineTo(-4, 0);
  ctx.stroke();

  // Steel leaf spearhead
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(14, -5);
  ctx.lineTo(30, 0);
  ctx.lineTo(14, 5);
  ctx.closePath();
  ctx.fill();

  // Spearhead center ridge highlight
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(28, 0);
  ctx.stroke();

  ctx.restore();
}

function drawReadyZone() {
  if (state !== 'COUNTDOWN') return;

  ctx.save();
  ctx.fillStyle = mouse.inReady
    ? 'rgba(46, 160, 67, 0.22)'
    : 'rgba(217, 56, 41, 0.25)';
  ctx.strokeStyle = mouse.inReady ? '#3fb950' : '#f85149';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.fillRect(READY_ZONE.x, READY_ZONE.y, READY_ZONE.w, READY_ZONE.h);
  ctx.strokeRect(READY_ZONE.x, READY_ZONE.y, READY_ZONE.w, READY_ZONE.h);

  ctx.setLineDash([]);
  ctx.fillStyle = '#f7e6c4';
  ctx.font = 'bold 14px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    'READY ZONE',
    READY_ZONE.x + READY_ZONE.w / 2,
    READY_ZONE.y + READY_ZONE.h / 2 - 6
  );
  ctx.font = '12px Georgia, serif';
  ctx.fillStyle = '#d0c0a8';
  ctx.fillText(
    mouse.inReady ? 'Hold steady...' : 'Move cursor here!',
    READY_ZONE.x + READY_ZONE.w / 2,
    READY_ZONE.y + READY_ZONE.h / 2 + 16
  );
  ctx.restore();
}

function drawCenterPrompt() {
  ctx.save();
  ctx.textAlign = 'center';
  if (state === 'COUNTDOWN') {
    if (!mouse.inReady) {
      ctx.fillStyle = '#ff6b6b';
      ctx.font = 'bold 26px Georgia, serif';
      ctx.fillText('PLACE CURSOR IN READY ZONE!', W / 2, 145);
    } else {
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 72px Georgia, serif';
      ctx.fillText(String(countdownValue), W / 2, 175);
    }
  } else if (state === 'DUEL' && performance.now() - duelStartTime < 900) {
    ctx.fillStyle = '#ff4d4d';
    ctx.font = 'bold 64px Georgia, serif';
    ctx.fillText('THROW!', W / 2, 170);
  }
  ctx.restore();
}

function render() {
  ctx.save();
  if (shakeTime > 0) {
    const sx = (Math.random() * 2 - 1) * shakeIntensity;
    const sy = (Math.random() * 2 - 1) * shakeIntensity;
    ctx.translate(sx, sy);
  }

  drawBackground();

  // Stuck javelins
  stuckJavelins.forEach((sj) => drawJavelin(sj.x, sj.y, sj.angle));

  // Duelists
  drawDuelist(player);
  drawDuelist(enemy);

  // Projectiles & trails
  projectiles.forEach((p) => {
    if (p.trail.length > 1) {
      ctx.strokeStyle = 'rgba(255, 235, 200, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.trail[0].x, p.trail[0].y);
      for (let i = 1; i < p.trail.length; i++) {
        ctx.lineTo(p.trail[i].x, p.trail[i].y);
      }
      ctx.stroke();
    }
    drawJavelin(p.x, p.y, p.angle);
  });

  // Particles
  particles.forEach((pt) => {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
  });
  ctx.globalAlpha = 1;

  // Floating texts
  floatingTexts.forEach((ft) => {
    ctx.globalAlpha = Math.max(0, ft.life);
    ctx.fillStyle = ft.color;
    ctx.font = 'bold 20px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
  });
  ctx.globalAlpha = 1;

  drawReadyZone();
  drawCenterPrompt();

  ctx.restore();
}

function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = Math.min(0.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  update(dt);
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
