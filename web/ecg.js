/* Decorative heartbeat line for hero banners. */
document.querySelectorAll('.hero').forEach(h=>{
  const d='M0 40 H120 l12 -8 l12 8 H260 l10 -4 l8 4 H360 l14 -34 l14 58 l14 -24 H520 l12 -8 l12 8 H700 l10 -4 l8 4 H800 l14 -34 l14 58 l14 -24 H1000';
  h.querySelector('.wrap').insertAdjacentHTML('afterend','<svg class="ecg" viewBox="0 0 1000 70" preserveAspectRatio="none" aria-hidden="true"><path d="'+d+'"/></svg>');
});
