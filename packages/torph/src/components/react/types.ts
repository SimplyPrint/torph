import { TextMorphOptions } from "./../../lib/text-morph/types";

export type TextMorphProps = Omit<TextMorphOptions, "element"> & {
  children: string; //React.ReactNode;
};
