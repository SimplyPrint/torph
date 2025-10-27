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
    const oldWidth = element.offsetWidth;
    const oldHeight = element.offsetHeight;

    const byWord = value.includes(" ");

    const segmenter = new Intl.Segmenter(this.options.locale, {
      granularity: byWord ? "word" : "grapheme",
    });

    const iterator = segmenter.segment(value)[Symbol.iterator]();
    const blocks = this.blocks(iterator);

    this.prevMeasures = this.measure();

    element.innerHTML = "";

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
      // temporarily remove
      const parent = child.parentElement!;
      parent.removeChild(child);

      // force a reflow
      void child.offsetHeight;

      // re-insert
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

      child.style.setProperty(
        "--invert",
        `translate(${deltaX}px, ${deltaY}px) scale(${isNew ? 0.95 : 1})`,
      );
      child.style.setProperty("--opacity", isNew ? "0" : "1");
      child.style.setProperty(
        "--delay",
        isNew ? `${this.options.duration! * 0.2}ms` : `0ms`,
      );
    });
  }

  private addStyles() {
    const style = document.createElement("style");
    style.innerHTML = `
  
  [torph-root],
  [torph-group] {
      display:inline-flex;
      position:relative;
      transition-duration: ${this.options.duration}ms;
      transition-timing-function: ${this.options.ease};
      transition-property: width, height;
      will-change: width, height;
      transform:translateZ(10px);
  }
  
  [torph-item] {
      display: inline-block;
      transition-duration: inherit;
      transition-delay: var(--delay, 0ms);
      transition-timing-function: inherit;
      transition-property: opacity, transform;
      will-change: opacity, transform;
      transform: none;
      opacity: 1;
      @starting-style {
          transform: var(--invert);
          opacity: var(--opacity);
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
}
