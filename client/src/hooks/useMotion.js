import { useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
  // Mobile browser chrome resizing shouldn't force extra refresh calculations.
  ScrollTrigger.config({ ignoreMobileResize: true });
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Reveals [data-reveal] elements inside the scope once they enter the viewport.
 * Only opacity + transform are animated, ScrollTrigger batches the work, and
 * each element animates once so scrolling stays cheap.
 *
 * Pass `refreshKey` (for example a list length) when data renders after mount.
 */
export function useScrollReveal(scopeRef, options = {}) {
  const {
    selector = '[data-reveal]',
    y = 22,
    duration = 0.7,
    stagger = 0.06,
    start = 'top 92%',
    refreshKey = '',
  } = options;

  useLayoutEffect(() => {
    const scope = scopeRef.current;
    if (!scope || prefersReducedMotion()) return undefined;

    const context = gsap.context(() => {
      const targets = gsap.utils.toArray(selector, scope);
      if (!targets.length) return;

      // Split into what is already on screen (animate now) and what is below
      // (animate on scroll) so above-the-fold content never stays hidden.
      const viewportHeight = window.innerHeight;
      const onScreen = [];
      const below = [];
      targets.forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.top < viewportHeight * 0.98 && rect.bottom > 0) onScreen.push(element);
        else below.push(element);
      });

      if (onScreen.length) {
        gsap.from(onScreen, {
          autoAlpha: 0,
          y,
          duration,
          ease: 'power3.out',
          stagger,
          clearProps: 'transform',
        });
      }

      if (below.length) {
        gsap.set(below, { autoAlpha: 0, y });
        ScrollTrigger.batch(below, {
          start,
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, {
              autoAlpha: 1,
              y: 0,
              duration,
              ease: 'power3.out',
              stagger,
              overwrite: true,
            }),
        });

        // Safety net: if layout settled after the split and something is
        // already visible, reveal it on the next frame instead of leaving it
        // hidden until a scroll happens.
        requestAnimationFrame(() => {
          const visible = below.filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.top < window.innerHeight * 0.98 && rect.bottom > 0;
          });
          if (visible.length) {
            gsap.to(visible, {
              autoAlpha: 1,
              y: 0,
              duration,
              ease: 'power3.out',
              stagger,
              overwrite: true,
            });
          }
        });
      }
    }, scope);

    return () => context.revert();
  }, [scopeRef, selector, y, duration, stagger, start, refreshKey]);
}

/**
 * Shared dialog entrance: backdrop fades in, panel eases up with a subtle
 * scale. Opacity/transform only; skipped for reduced-motion users.
 */
export function useModalMotion(panelRef, backdropRef, motionKey = '') {
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return undefined;

    const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
    if (backdropRef?.current) {
      timeline.fromTo(
        backdropRef.current,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.24, ease: 'power1.out' },
        0,
      );
    }
    if (panelRef?.current) {
      timeline.fromTo(
        panelRef.current,
        { autoAlpha: 0, y: 26, scale: 0.975 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.46, clearProps: 'transform' },
        0.04,
      );
    }

    return () => timeline.kill();
  }, [panelRef, backdropRef, motionKey]);
}

/** Pointer-only hover lift for cards, with listeners cleaned up properly. */
export function useHoverLift(scopeRef, selector = '[data-hover-lift]', refreshKey = '') {
  useLayoutEffect(() => {
    const scope = scopeRef.current;
    if (!scope || prefersReducedMotion()) return undefined;
    if (!window.matchMedia('(hover: hover)').matches) return undefined;

    const bindings = [];
    const context = gsap.context(() => {
      gsap.utils.toArray(selector, scope).forEach((el) => {
        const enter = () => gsap.to(el, { y: -4, duration: 0.28, ease: 'power2.out', overwrite: 'auto' });
        const leave = () => gsap.to(el, { y: 0, duration: 0.32, ease: 'power2.out', overwrite: 'auto' });
        el.addEventListener('pointerenter', enter);
        el.addEventListener('pointerleave', leave);
        el.addEventListener('focusin', enter);
        el.addEventListener('focusout', leave);
        bindings.push(
          [el, 'pointerenter', enter],
          [el, 'pointerleave', leave],
          [el, 'focusin', enter],
          [el, 'focusout', leave],
        );
      });
    }, scope);

    return () => {
      bindings.forEach(([el, type, handler]) => el.removeEventListener(type, handler));
      context.revert();
    };
  }, [scopeRef, selector, refreshKey]);
}
