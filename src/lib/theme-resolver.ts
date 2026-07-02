import {
  BUILTIN_THEMES,
  THEME_LIST,
  VALID_THEME_IDS,
  THEME_CSS_IMPORTS,
  DEFAULT_THEME_CONFIG,
} from "@/lib/theme-registry.gen";
import type { ThemeConfig, ThemeFeatures } from "@/lib/theme-registry.gen";

export type { ThemeConfig, ThemeFeatures };
export { BUILTIN_THEMES, THEME_LIST, VALID_THEME_IDS, THEME_CSS_IMPORTS };

const resolvedCache = new Map<string, ThemeConfig>();

export function resolveThemeConfig(themeId: string | null | undefined): ThemeConfig {
  const id = themeId && BUILTIN_THEMES[themeId] ? themeId : "default";

  const cached = resolvedCache.get(id);
  if (cached) return cached;

  const customConfig = BUILTIN_THEMES[id];
  const resolved: ThemeConfig = {
    ...DEFAULT_THEME_CONFIG,
    ...customConfig,
    features: {
      ...DEFAULT_THEME_CONFIG.features,
      ...(customConfig.features || {}),
    },
  };

  resolvedCache.set(id, resolved);
  return resolved;
}
