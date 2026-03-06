import {
  parseTranslate,
  cancelAnimations,
  fadeDuration,
} from "../utils/animate";

export function animateNumberExit(
  child: HTMLElement,
  options: {
    dx: number;
    dy: number;
    slideDistance: number;
    duration: number;
    ease: string;
  },
) {
  const { dx, dy, slideDistance, duration, ease } = options;

  child.animate(
    {
      transform: `translate(${dx}px, ${dy + slideDistance}px)`,
      offset: 1,
    },
    {
      duration,
      easing: ease,
      fill: "both",
    },
  );

  const fadeAnimation = child.animate(
    {
      opacity: 0,
      offset: 1,
    },
    {
      duration: fadeDuration(duration, 0.25),
      easing: "linear",
      fill: "both",
    },
  );

  fadeAnimation.onfinish = () => child.remove();
}

export function animateNumberEnter(
  child: HTMLElement,
  options: {
    deltaX: number;
    deltaY: number;
    slideDistance: number;
    kind: "digit" | "symbol";
    duration: number;
    ease: string;
  },
) {
  const { deltaX, deltaY, slideDistance, kind, duration, ease } = options;

  const prev = cancelAnimations(child);

  const slideOffset = kind === "digit" ? -slideDistance : slideDistance;
  const startX = deltaX + prev.tx;
  const startY = deltaY + prev.ty + slideOffset;

  child.animate(
    {
      transform: `translate(${startX}px, ${startY}px)`,
      offset: 0,
    },
    {
      duration,
      easing: ease,
      fill: "both",
    },
  );

  const startOpacity = prev.opacity >= 1 ? 0 : prev.opacity;
  if (startOpacity < 1) {
    child.animate(
      [{ opacity: startOpacity }, { opacity: 1 }],
      {
        duration: fadeDuration(duration, 0.5),
        easing: "linear",
        fill: "both",
      },
    );
  }
}

export function animateNumberPersist(
  child: HTMLElement,
  options: {
    deltaX: number;
    deltaY: number;
    duration: number;
    ease: string;
  },
) {
  const { deltaX, deltaY, duration, ease } = options;

  const { tx, ty } = parseTranslate(child);
  child.getAnimations().forEach((a) => a.cancel());

  const startX = deltaX + tx;
  const startY = deltaY + ty;

  if (startX === 0 && startY === 0) return;

  child.animate(
    {
      transform: `translate(${startX}px, ${startY}px)`,
      offset: 0,
    },
    {
      duration,
      easing: ease,
      fill: "both",
    },
  );
}
