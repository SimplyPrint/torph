import { TextMorphOptions } from "./types";

type Measures = {
  [key: string]: { x: number; y: number };
};

export class TextMorph {
  private element: HTMLElement;

  private options: Omit<TextMorphOptions, "element"> = {};

  private currentMeasures: Measures = {};
  private prevMeasures: Measures = {};

  constructor(options: TextMorphOptions) {
    this.element = options.element;
    this.element.setAttribute("torph-root", "");
    if (options.debug) this.element.setAttribute("torph-debug", "");

    this.options = {
      locale: "en",
      duration: 400,
      ease: "cubic-bezier(0.19, 1, 0.22, 1)",
      ...options,
    };

    this.addStyles();
  }

  destroy() {
    this.element.removeAttribute("torph-root");
    this.element.removeAttribute("torph-debug");
    this.removeStyles();
  }

  update(value: HTMLElement | string) {
    if (value instanceof HTMLElement) {
      // TODO: handle HTMLElement case
    } else {
      this.createTextGroup(value, this.element);
    }
  }

  private createTextGroup(value: string, element: HTMLElement) {
    if (value === element.innerText) return;

    const oldWidth = element.offsetWidth;
    const oldHeight = element.offsetHeight;

    const byWord = value.includes(" ");
    const segmenter = new Intl.Segmenter(this.options.locale, {
      granularity: byWord ? "word" : "grapheme",
    });
    const iterator = segmenter.segment(value)[Symbol.iterator]();
    const blocks = this.blocks(iterator);

    this.prevMeasures = this.measure();
    const oldChildren = Array.from(element.children) as HTMLElement[];
    const newIds = new Set(blocks.map((b) => b.id));

    const exiting = oldChildren.filter(
      (child) => !newIds.has(child.getAttribute("torph-id") as string),
    );

    const parentRect = this.getUnscaledBoundingClientRect(element);
    exiting.forEach((child) => {
      const rect = this.getUnscaledBoundingClientRect(child);
      child.style.position = "absolute";
      child.style.pointerEvents = "none";
      child.style.left = `${rect.left - parentRect.left}px`;
      child.style.top = `${rect.top - parentRect.top}px`;
      child.style.width = `${rect.width}px`;
      child.style.height = `${rect.height}px`;
    });

    oldChildren.forEach((child) => {
      const id = child.getAttribute("torph-id") as string;
      if (newIds.has(id)) child.remove();
    });

    blocks.forEach((block) => {
      const span = document.createElement("span");
      span.setAttribute("torph-item", "");
      span.setAttribute("torph-id", block.id);
      span.textContent = block.string;
      element.appendChild(span);
    });

    this.currentMeasures = this.measure();
    this.updateStyles();
    this.restartStartingStyle();

    exiting.forEach((child) => {
      const id = child.getAttribute("torph-id")!;
      const prev = this.prevMeasures[id];

      const siblings = Array.from(element.children) as HTMLElement[];
      const nearest = siblings.find((s) => {
        const sRect = s.getBoundingClientRect();
        const cRect = child.getBoundingClientRect();
        return Math.abs(sRect.left - cRect.left) < 40;
      });

      const nextPos = nearest
        ? this.currentMeasures[nearest.getAttribute("torph-id")!]
        : prev;

      const dx = (nextPos ? nextPos.x - (prev?.x || 0) : 0) * 0.5;
      const dy = (nextPos ? nextPos.y - (prev?.y || 0) : 0) * 0.5;

      const animation = child.animate(
        {
          transform: `translate(${dx}px, ${dy}px) scale(0.95)`,
          opacity: 0,
          offset: 1,
        },
        {
          duration: this.options.duration,
          easing: this.options.ease,
          fill: "both",
        },
      );
      animation.onfinish = () => child.remove();
    });

    if (oldWidth === 0 || oldHeight === 0) return;

    element.style.width = "auto";
    element.style.height = "auto";
    void element.offsetWidth;

    const newWidth = element.offsetWidth;
    const newHeight = element.offsetHeight;

    element.style.width = `${oldWidth}px`;
    element.style.height = `${oldHeight}px`;
    void element.offsetWidth;

    element.style.width = `${newWidth}px`;
    element.style.height = `${newHeight}px`;

    setTimeout(() => {
      element.style.width = "auto";
      element.style.height = "auto";
    }, this.options.duration);
  }

  private restartStartingStyle() {
    const children = Array.from(this.element.children) as HTMLElement[];

    children.forEach((child) => {
      const parent = child.parentElement!;
      parent.removeChild(child);

      void child.offsetHeight;

      parent.appendChild(child);
    });
  }

  private measure() {
    const children = Array.from(this.element.children) as HTMLElement[];
    const measures: Measures = {};

    children.forEach((child, index) => {
      const key = child.getAttribute("torph-id") || `child-${index}`;
      measures[key] = {
        x: child.offsetLeft,
        y: child.offsetTop,
      };
    });

    return measures;
  }

  private updateStyles() {
    const children = Array.from(this.element.children) as HTMLElement[];

    children.forEach((child, index) => {
      const key = child.getAttribute("torph-id") || `child-${index}`;
      const prev = this.prevMeasures[key];
      const current = this.currentMeasures[key];

      const cx = current?.x || 0;
      const cy = current?.y || 0;

      const deltaX = prev ? prev?.x - cx : 0;
      const deltaY = prev ? prev?.y - cy : 0;
      const isNew = !prev;

      child.animate(
        {
          transform: `translate(${deltaX}px, ${deltaY}px) scale(${isNew ? 0.95 : 1})`,
          opacity: isNew ? 0 : 1,
          offset: 0,
        },
        {
          duration: this.options.duration,
          easing: this.options.ease,
          delay: isNew ? this.options.duration! * 0.2 : 0,
          fill: "both",
        },
      );
    });
  }

  private addStyles() {
    const style = document.createElement("style");
    style.innerHTML = `
[torph-root],
[torph-group] {
  display: inline-flex; /* TODO: remove for multi-line support */
  position: relative;
  transition-duration: ${this.options.duration}ms;
  transition-timing-function: ${this.options.ease};
  transition-property: width, height;
  will-change: width, height;
}

[torph-item] {
  display: inline-block;
  will-change: opacity, transform;
  transform: none;
  opacity: 1;
}
  
[torph-root][torph-debug] {
  outline:2px solid magenta;
  [torph-item] {
    outline:2px solid cyan;
    outline-offset: -4px;
  }
}
  `;
    document.head.appendChild(style);
  }

  private removeStyles() {
    const styles = document.head.getElementsByTagName("style");
    Array.from(styles).forEach((style) => {
      if (style.innerHTML.includes("[torph-root]")) {
        document.head.removeChild(style);
      }
    });
  }

  // utils

  private blocks(iterator: Intl.SegmentIterator<Intl.SegmentData>) {
    const uniqueStrings: {
      id: string;
      string: string;
    }[] = Array.from(iterator).reduce(
      (acc, string) => {
        if (string.segment === " ") {
          return [...acc, { id: `space-${string.index}`, string: "\u00A0" }];
        }

        const existingString = acc.find((x) => x.string === string.segment);
        if (existingString) {
          return [
            ...acc,
            { id: `${string.segment}-${string.index}`, string: string.segment },
          ];
        }

        return [
          ...acc,
          {
            id: string.segment,
            string: string.segment,
          },
        ];
      },
      [] as {
        id: string;
        string: string;
      }[],
    );

    return uniqueStrings;
  }

  private getUnscaledBoundingClientRect(element: HTMLElement) {
    const scaledRect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    const transform = computedStyle.transform;

    let scaleX = 1;
    let scaleY = 1;

    const matrixRegex = /matrix\(([^)]+)\)/;
    const match = transform.match(matrixRegex);

    if (match) {
      const values = match[1]?.split(",").map(Number);
      if (values && values?.length >= 4) {
        scaleX = values[0]!;
        scaleY = values[3]!;
      }
    } else {
      const scaleXMatch = transform.match(/scaleX\(([^)]+)\)/);
      const scaleYMatch = transform.match(/scaleY\(([^)]+)\)/);
      if (scaleXMatch) scaleX = parseFloat(scaleXMatch[1]!);
      if (scaleYMatch) scaleY = parseFloat(scaleYMatch[1]!);
    }

    const unscaledWidth = scaledRect.width / scaleX;
    const unscaledHeight = scaledRect.height / scaleY;

    const unscaledX = scaledRect.x + (scaledRect.width - unscaledWidth) / 2;
    const unscaledY = scaledRect.y + (scaledRect.height - unscaledHeight) / 2;

    return {
      x: unscaledX,
      y: unscaledY,
      width: unscaledWidth,
      height: unscaledHeight,
      top: unscaledY,
      right: unscaledX + unscaledWidth,
      bottom: unscaledY + unscaledHeight,
      left: unscaledX,
    };
  }
}
