/* Decorative-only 3D feedback; does not modify app state or any business calculation. */
(() => {
  'use strict';
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const tiltSelector = '.stat, .person-card, .quick-btn, .hero-extra, .mobile-extra-card';
  let active = null;
  const reset = (el) => {
    if (!el) return;
    el.style.removeProperty('--tilt-x');
    el.style.removeProperty('--tilt-y');
    el.classList.remove('fx-tilt');
  };
  document.addEventListener('pointermove', (e) => {
    if (!finePointer.matches || reduceMotion.matches) return;
    const el = e.target.closest?.(tiltSelector);
    if (el !== active) { reset(active); active = el; }
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Soft tilt capped at 2.5 degrees, avoiding motion sickness and layout jumps.
    const x = (e.clientX - rect.left) / rect.width - .5;
    const y = (e.clientY - rect.top) / rect.height - .5;
    el.classList.add('fx-tilt');
    el.style.setProperty('--tilt-x', `${(-y * 5).toFixed(2)}deg`);
    el.style.setProperty('--tilt-y', `${(x * 5).toFixed(2)}deg`);
  }, {passive:true});
  document.addEventListener('pointerout', (e) => {
    if (active && (!e.relatedTarget || !active.contains(e.relatedTarget))) { reset(active); active=null; }
  }, {passive:true});
  document.addEventListener('pointerdown', (e) => {
    if (reduceMotion.matches) return;
    const el=e.target.closest?.('.btn, .quick-btn, .app-tab');
    if (!el || el.disabled) return;
    const rect=el.getBoundingClientRect();
    const ripple=document.createElement('span');
    ripple.className='fx-ripple';
    ripple.style.left=`${e.clientX-rect.left}px`;
    ripple.style.top=`${e.clientY-rect.top}px`;
    el.append(ripple);
    ripple.addEventListener('animationend',()=>ripple.remove(),{once:true});
  },{passive:true});
})();
