type ThemeParams = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
};

const THEME_VAR_MAP: Record<keyof ThemeParams, string> = {
  bg_color: "--tg-bg-color",
  text_color: "--tg-text-color",
  hint_color: "--tg-hint-color",
  link_color: "--tg-link-color",
  button_color: "--tg-button-color",
  button_text_color: "--tg-button-text-color",
  secondary_bg_color: "--tg-secondary-bg-color",
  header_bg_color: "--tg-header-bg-color",
  accent_text_color: "--tg-accent-text-color",
  section_bg_color: "--tg-section-bg-color",
  section_header_text_color: "--tg-section-header-text-color",
  subtitle_text_color: "--tg-subtitle-text-color",
  destructive_text_color: "--tg-destructive-text-color",
};

export function applyTelegramTheme(themeParams: ThemeParams): void {
  const root = document.documentElement;

  for (const [key, cssVar] of Object.entries(THEME_VAR_MAP)) {
    const value = themeParams[key as keyof ThemeParams];
    if (value) {
      root.style.setProperty(cssVar, value);
    }
  }
}
