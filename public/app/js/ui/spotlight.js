// @ts-check
/**
 * Spotlight que segue o mouse (CMP-05): UM listener `pointermove` com `requestAnimationFrame`,
 * escopo no `.spot-group`. Desligado em toque pelo CSS (`@media (hover: none)`).
 * Chamar `iniciarSpotlight()` uma vez.
 */
export function iniciarSpotlight() {
  let pendente = false;
  /** @type {PointerEvent|null} */ let ultimo = null;
  /** @type {Element|null} */ let grupoAtivo = null;

  document.addEventListener('pointermove', (e) => {
    ultimo = e;
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(() => {
      pendente = false;
      if (!ultimo) return;
      const alvo = /** @type {Element|null} */ ((/** @type {any} */ (ultimo.target))?.closest?.('.spot-group') || null);
      if (grupoAtivo && grupoAtivo !== alvo) grupoAtivo.classList.remove('spot-on');
      grupoAtivo = alvo;
      if (!alvo) return;
      alvo.classList.add('spot-on');
      const cards = /** @type {NodeListOf<HTMLElement>} */ (alvo.querySelectorAll('.spot'));
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        cards[i].style.setProperty('--mx', `${ultimo.clientX - r.left}px`);
        cards[i].style.setProperty('--my', `${ultimo.clientY - r.top}px`);
      }
    });
  }, { passive: true });

  document.addEventListener('pointerleave', () => { grupoAtivo?.classList.remove('spot-on'); grupoAtivo = null; });
}
