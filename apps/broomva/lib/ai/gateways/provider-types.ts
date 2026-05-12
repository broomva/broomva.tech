export type StrictLiterals<T> = T extends string
  ? string extends T
    ? never
    : T
  : T;

export type ExtractModelIdFromProvider<
  ProviderFactory extends (...args: any) => {
    languageModel: (modelId: any) => any;
  },
> = Parameters<ReturnType<ProviderFactory>["languageModel"]>[0];

export type ExtractImageModelIdFromProvider<
  ProviderFactory extends (...args: any) => {
    image: (modelId: any) => any;
  },
> = Parameters<ReturnType<ProviderFactory>["image"]>[0];
