import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

gsap.defaults({
  duration: 0.6,
  ease: "power3.out",
});

export { gsap, ScrollTrigger };

/** 检测用户是否偏好减少动画 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 创建滚动触发的 reveal 动画；自动适配 reduced-motion */
export function createReveal(
  scope: Element | null,
  selector: string,
  vars: gsap.TweenVars & { y?: number | string; stagger?: number | object } = {},
  scrollTriggerVars: Partial<ScrollTrigger.Vars> = {},
): gsap.core.Tween {
  if (!scope) return null as unknown as gsap.core.Tween;
  const els = gsap.utils.toArray<HTMLElement>(selector, scope);
  if (els.length === 0) return null as unknown as gsap.core.Tween;

  const reduced = prefersReducedMotion();

  const defaultVars: gsap.TweenVars = {
    y: reduced ? 0 : (vars.y ?? 30),
    autoAlpha: reduced ? 1 : 0,
    duration: reduced ? 0 : (vars.duration ?? 0.7),
    ease: vars.ease ?? "power3.out",
    stagger: reduced ? 0 : (vars.stagger ?? 0),
    scrollTrigger: {
      trigger: els[0],
      start: scrollTriggerVars.start ?? "top 88%",
      toggleActions: scrollTriggerVars.toggleActions ?? "play none none none",
      ...(scrollTriggerVars as object),
    },
  };

  // 合并时去掉原 vars 中的 scrollTrigger，避免冲突
  const { scrollTrigger: _st, ...restVars } = vars;
  return gsap.from(els, { ...defaultVars, ...restVars });
}

/** 创建 hero 入场时间线（不需要 scrollTrigger） */
export function createHeroTimeline(
  scope: Element | null,
  selectors: string[],
  stagger = 0.12,
): gsap.core.Timeline | null {
  if (!scope || prefersReducedMotion()) return null;

  const els = selectors
    .map((s) => gsap.utils.toArray<HTMLElement>(s, scope))
    .flat();

  if (els.length === 0) return null;

  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  tl.from(els, {
    y: 40,
    autoAlpha: 0,
    duration: 0.8,
    stagger,
  });
  return tl;
}

/** 创建一个元素从 scale 0.95 + fade 的入场 */
export function createScaleReveal(
  scope: Element | null,
  selector: string,
  vars: gsap.TweenVars & { y?: number | string; stagger?: number | object } = {},
  scrollTriggerVars: Partial<ScrollTrigger.Vars> = {},
): gsap.core.Tween {
  if (!scope) return null as unknown as gsap.core.Tween;
  const els = gsap.utils.toArray<HTMLElement>(selector, scope);
  if (els.length === 0) return null as unknown as gsap.core.Tween;

  const reduced = prefersReducedMotion();

  const defaultVars: gsap.TweenVars = {
    y: reduced ? 0 : (vars.y ?? 24),
    scale: reduced ? 1 : 0.96,
    autoAlpha: reduced ? 1 : 0,
    duration: reduced ? 0 : (vars.duration ?? 0.7),
    ease: vars.ease ?? "power3.out",
    stagger: reduced ? 0 : (vars.stagger ?? 0.08),
    scrollTrigger: {
      trigger: els[0],
      start: scrollTriggerVars.start ?? "top 88%",
      toggleActions: scrollTriggerVars.toggleActions ?? "play none none none",
      ...(scrollTriggerVars as object),
    },
  };

  const { scrollTrigger: _st, ...restVars } = vars;
  return gsap.from(els, { ...defaultVars, ...restVars });
}

/** 为 Docs 长内容区块创建轻量级 reveal */
export function createDocsReveal(
  scope: Element | null,
  selector: string,
): gsap.core.Tween {
  if (!scope) return null as unknown as gsap.core.Tween;
  const els = gsap.utils.toArray<HTMLElement>(selector, scope);
  if (els.length === 0) return null as unknown as gsap.core.Tween;

  const reduced = prefersReducedMotion();

  return gsap.from(els, {
    y: reduced ? 0 : 20,
    autoAlpha: reduced ? 1 : 0,
    duration: reduced ? 0 : 0.5,
    ease: "power2.out",
    stagger: reduced ? 0 : 0.06,
    scrollTrigger: {
      trigger: els[0],
      start: "top 90%",
      toggleActions: "play none none none",
    },
  });
}
