<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { DEFAULT_AS, DEFAULT_TEXT_MORPH_OPTIONS, type TextMorphOptions } from '../lib/text-morph';
  import { MorphController } from '../lib/text-morph/controller';

  type $$Props = Omit<TextMorphOptions, "element"> & {
    text?: string | null;
    class?: string;
    style?: string;
    as?: string;
  };

  export let text: $$Props["text"];
  export let locale: $$Props["locale"] = DEFAULT_TEXT_MORPH_OPTIONS.locale;
  export let duration: $$Props["duration"] = DEFAULT_TEXT_MORPH_OPTIONS.duration;
  export let ease: $$Props["ease"] = DEFAULT_TEXT_MORPH_OPTIONS.ease;
  export let scale: $$Props["scale"] = DEFAULT_TEXT_MORPH_OPTIONS.scale;
  export let debug: $$Props["debug"] = DEFAULT_TEXT_MORPH_OPTIONS.debug;
  export let disabled: $$Props["disabled"] = DEFAULT_TEXT_MORPH_OPTIONS.disabled;
  export let respectReducedMotion: $$Props["respectReducedMotion"] =
    DEFAULT_TEXT_MORPH_OPTIONS.respectReducedMotion;
  export let onAnimationStart: $$Props["onAnimationStart"] = undefined;
  export let onAnimationComplete: $$Props["onAnimationComplete"] = undefined;
  export let as: NonNullable<$$Props["as"]> = DEFAULT_AS;

  let className: string | undefined = undefined;
  export { className as class };
  export let style: string | undefined = undefined;

  let containerRef: HTMLElement | undefined;
  const controller = new MorphController();
  let mounted = false;
  let lastConfigKey = "";

  $: options = {
    locale,
    duration,
    ease,
    debug,
    scale,
    disabled,
    respectReducedMotion,
    onAnimationStart,
    onAnimationComplete,
  };

  $: configKey = MorphController.serializeConfig(options);

  $: if (mounted && containerRef && configKey !== lastConfigKey) {
    controller.attach(containerRef, options);
    lastConfigKey = configKey;
  }

  $: if (mounted) {
    controller.update(text ?? "");
  }

  onMount(() => {
    if (containerRef) {
      controller.attach(containerRef, options);
      lastConfigKey = configKey;
      mounted = true;
    }
  });

  onDestroy(() => {
    controller.destroy();
  });
</script>

<svelte:element
  this={as}
  bind:this={containerRef}
  class={className}
  style={style}
></svelte:element>
