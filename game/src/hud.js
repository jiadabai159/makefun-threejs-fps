// The DOM HUD: crosshair, hit marker, health and armour bars, ammo, money, round timer
// and score, kill feed, centre banner, plant progress, the buy menu and the overlay
// panels. It never touches the simulation; main.js pushes numbers in and reads the
// play/buy callbacks out. Every setter skips a write when the value has not changed.
const COPY = {
  start: {
    title: 'SABLE YARD',
    copy: 'A dusk yard, four FOX defenders, one spike. Plant it at A or B — or drop them all. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'SABLE YARD',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundWin: {
    title: 'Round won',
    copy: '',
    action: 'Next round',
  },
  roundLose: {
    title: 'Round lost',
    copy: '',
    action: 'Next round',
  },
  matchWin: {
    title: 'Match won',
    copy: 'SABLE YARD is yours. The FOX defence never stood a chance.',
    action: 'Play again',
  },
  matchLose: {
    title: 'Match lost',
    copy: 'The FOX defence held the yard. Run it back.',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammo = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthBar = $('health-fill');
  const healthValue = $('health-value');
  const armorBar = $('armor-fill');
  const armorRow = $('armor-row');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const roundScore = $('round-score');
  const feed = $('feed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const plant = $('plant');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const buy = $('buy');
  const buyMoney = $('buy-money');
  const buyItems = $('buy-items');
  const buyDeploy = $('buy-deploy');
  let hitTimer = 0;
  let bannerTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastHealth = -1;
  let lastArmor = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastRounds = '';

  return {
    setAmmo(mag, reserve, name) {
      if (mag === lastMag && reserve === lastReserve && name === lastWeapon) return;
      lastMag = mag;
      lastReserve = reserve;
      lastWeapon = name;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
      ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(health, armor) {
      if (health === lastHealth && armor === lastArmor) return;
      lastHealth = health;
      lastArmor = armor;
      healthBar.style.width = `${health}%`;
      healthValue.textContent = String(health);
      armorRow.style.display = armor > 0 ? 'flex' : 'none';
      armorBar.style.width = `${armor}%`;
      healthBar.classList.toggle('low', health <= 25);
    },
    setMoney(money) {
      if (money === lastMoney) return;
      lastMoney = money;
      moneyValue.textContent = `$${money}`;
      buyMoney.textContent = `$${money}`;
    },
    setTimer(seconds) {
      const text = seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : `${seconds}s`;
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('urgent', seconds <= 10);
    },
    setRounds(won, lost, target) {
      const text = `YOU ${won} — ${lost} FOX · first to ${target}`;
      if (text === lastRounds) return;
      lastRounds = text;
      roundScore.textContent = text;
    },
    hitMarker(killed, holdMs = 90) {
      const marker = $('hitmarker');
      marker.classList.add('on');
      marker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        marker.classList.remove('on');
        marker.style.transform = '';
      }, holdMs);
    },
    feedLine(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      feed.prepend(line);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => line.classList.add('fade'), 4200);
    },
    showBanner(titleText, subText, ms = 2200) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, ms);
    },
    hideBanner() {
      banner.hidden = true;
    },
    setPlant(progress, label) {
      if (progress <= 0) {
        plant.hidden = true;
        return;
      }
      plant.hidden = false;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
      plantLabel.textContent = label;
    },
    showOverlay(mode, detail) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'roundWin' || mode === 'roundLose' ? detail || '' : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    showBuy(items, money, onBuy, onDeploy) {
      buyMoney.textContent = `$${money}`;
      buyItems.innerHTML = '';
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-item';
        button.disabled = item.owned || money < item.price;
        button.innerHTML = `<b>${item.name}</b><span>${item.detail}</span><i>${item.owned ? 'OWNED' : '$' + item.price}</i>`;
        button.addEventListener('click', () => onBuy(item.id));
        buyItems.appendChild(button);
      }
      buy.hidden = false;
      buyDeploy.onclick = onDeploy;
    },
    hideBuy() {
      buy.hidden = true;
    },
  };
}
