import { NumberMorph } from "./index";
import type { NumberMorphOptions } from "./types";

export class NumberMorphController {
  private instance: NumberMorph | null = null;
  private lastValue: number | string = "";
  private lastCursorIndex?: number;
  private configKey = "";

  attach(element: HTMLElement, options: Omit<NumberMorphOptions, "element">) {
    this.instance?.destroy();
    this.instance = new NumberMorph({ element, ...options });
    this.configKey = NumberMorphController.serializeConfig(options);

    if (this.lastValue !== "") {
      this.instance.update(this.lastValue, this.lastCursorIndex);
    }
  }

  update(value: number | string, cursorIndex?: number) {
    this.lastValue = value;
    this.lastCursorIndex = cursorIndex;
    this.instance?.update(value, cursorIndex);
  }

  needsRecreate(options: Omit<NumberMorphOptions, "element">): boolean {
    return NumberMorphController.serializeConfig(options) !== this.configKey;
  }

  destroy() {
    this.instance?.destroy();
    this.instance = null;
  }

  static serializeConfig(options: Omit<NumberMorphOptions, "element">): string {
    return JSON.stringify({
      ease: options.ease,
      duration: options.duration,
      locale: options.locale,
      decimals: options.decimals,
      disabled: options.disabled,
      respectReducedMotion: options.respectReducedMotion,
    });
  }
}
