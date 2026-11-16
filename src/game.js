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
  // Sky gradient (dusk medieval sky)
  const sky = ctx.createLinearGradient(0, 0, 0, 380);
  sky.addColorStop(0, '#1c2536');
  sky.addColorStop(0.6, '#4a3531');
  sky.addColorStop(1, '#8c5332');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, 380);

  // Distant castle silhouette
  ctx.fillStyle = '#241d21';
  ctx.fillRect(120, 170, 720, 210);
  // Battlements
  for (let x = 120; x < 840; x += 36) {
    ctx.fillRect(x, 152, 20, 20);
  }
  // Towers
  ctx.fillRect(80, 110, 70, 270);
  ctx.fillRect(810, 110, 70, 270);
  ctx.beginPath();
  ctx.moveTo(75, 110);
  ctx.lineTo(115, 65);
  ctx.lineTo(155, 110);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(805, 110);
  ctx.lineTo(845, 65);
  ctx.lineTo(885, 110);
  ctx.fill();

  // Banners
  drawBanner(260, 190, '#7a1c1c');
  drawBanner(700, 190, '#1f4e78');

  // Courtyard ground
  const ground = ctx.createLinearGradient(0, 375, 0, H);
  ground.addColorStop(0, '#4f3b28');
  ground.addColorStop(1, '#291e14');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 375, W, H - 375);

  // Ground horizon line
  ctx.strokeStyle = '#6e5338';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 375);
  ctx.lineTo(W, 375);
  ctx.stroke();
}

function drawBanner(x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 16, y);
  ctx.lineTo(x + 16, y);
  ctx.lineTo(x + 16, y + 68);
  ctx.lineTo(x, y + 52);
  ctx.lineTo(x - 16, y + 68);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawDuelist(d) {
  if (!d) return;
  ctx.save();
  ctx.translate(d.x, d.y);

  if (d.dead) {
    ctx.rotate(d.isPlayer ? -Math.PI / 2.1 : Math.PI / 2.1);
    ctx.translate(0, 25);
  }

  const dir = d.isPlayer ? 1 : -1;
  const flash = d.hitFlash > 0;

  // Shadow
  if (!d.dead) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 28, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cape
  ctx.fillStyle = flash ? '#ffffff' : d.config.cape;
  ctx.beginPath();
  ctx.moveTo(-10 * dir, -112);
  ctx.lineTo(-34 * dir, -18);
  ctx.lineTo(-6 * dir, -18);
  ctx.closePath();
  ctx.fill();

  // Legs
  ctx.fillStyle = flash ? '#ffffff' : '#332c28';
  ctx.fillRect(-14, -56, 11, 56);
  ctx.fillRect(3, -56, 11, 56);

  // Tunic / Torso
  ctx.fillStyle = flash ? '#ffffff' : d.config.tunic;
  ctx.fillRect(-19, -114, 38, 60);

  // Armor chestplate
  ctx.fillStyle = flash ? '#ffffff' : d.config.armor;
  ctx.fillRect(-16, -110, 32, 30);

  // Head
  ctx.fillStyle = flash ? '#ffffff' : '#e0b899';
  ctx.beginPath();
  ctx.arc(0, -132, 15, 0, Math.PI * 2);
  ctx.fill();

  // Helmet / Crown
  ctx.fillStyle = flash ? '#ffffff' : d.config.armor;
  if (d.config.helmet === 'crown') {
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.moveTo(-14, -142);
    ctx.lineTo(-14, -156);
    ctx.lineTo(-6, -148);
    ctx.lineTo(0, -158);
    ctx.lineTo(6, -148);
    ctx.lineTo(14, -156);
    ctx.lineTo(14, -142);
    ctx.closePath();
    ctx.fill();
  } else if (d.config.helmet === 'horned') {
    ctx.beginPath();
    ctx.arc(0, -135, 16, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#dcdcdc';
    ctx.beginPath();
    ctx.moveTo(-12, -144);
    ctx.lineTo(-24, -162);
    ctx.lineTo(-6, -148);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(12, -144);
    ctx.lineTo(24, -162);
    ctx.lineTo(6, -148);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, -135, 16, Math.PI, 0);
    ctx.fill();
  }

  // Throwing Arm & Held Javelin
  const armAngle = d.throwAnim > 0 ? -0.6 * dir : 0.25 * dir;
  ctx.save();
  ctx.translate(8 * dir, -100);
  ctx.rotate(armAngle);
  ctx.fillStyle = flash ? '#ffffff' : d.config.armor;
  ctx.fillRect(-4, -4, 24 * dir, 9);

  if (d.javelins > 0 && !d.dead) {
    // Draw javelin in hand
    ctx.strokeStyle = '#8c5a32';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-22 * dir, 0);
    ctx.lineTo(42 * dir, 0);
    ctx.stroke();

    ctx.fillStyle = '#d9e2ec';
    ctx.beginPath();
    ctx.moveTo(42 * dir, -5);
    ctx.lineTo(56 * dir, 0);
    ctx.lineTo(42 * dir, 5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.restore();
}

function drawJavelin(x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Shaft
  ctx.strokeStyle = '#9c6638';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-34, 0);
  ctx.lineTo(14, 0);
  ctx.stroke();

  // Steel tip
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(14, -5);
  ctx.lineTo(28, 0);
  ctx.lineTo(14, 5);
  ctx.closePath();
  ctx.fill();

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
