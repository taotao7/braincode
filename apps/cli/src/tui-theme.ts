import React, { useContext } from "react";
import { execFileSync } from "node:child_process";
import type { BraincodeTheme } from "@braincode/config";
import type { TuiTheme, UiColor } from "./tui-types";

export const TUI_THEMES: Record<BraincodeTheme, TuiTheme> = {
  dark: {
    name: "dark",
    label: "Analog Dream: Magnetic Night",
    colors: {
      text: "#d4d4d4",
      muted: "#8a8f96",
      border: "#3a3f45",
      focusedBorder: "#ffb86c",
      blue: "#8be9fd",
      cyan: "#8be9fd",
      green: "#50fa7b",
      yellow: "#ffb86c",
      magenta: "#bd93f9",
      red: "#ff5555",
      gray: "#8a8f96",
    },
  },
  light: {
    name: "light",
    label: "Analog Dream: Beige Terminal",
    colors: {
      text: "#2d2a27",
      muted: "#6b6560",
      border: "#c4b8a8",
      focusedBorder: "#d65d0e",
      blue: "#076678",
      cyan: "#458588",
      green: "#79740e",
      yellow: "#d65d0e",
      magenta: "#b16286",
      red: "#9d0006",
      gray: "#6b6560",
    },
  },
};

export const TuiThemeContext = React.createContext<TuiTheme>(TUI_THEMES.dark);

export function useTuiTheme(): TuiTheme {
  return useContext(TuiThemeContext);
}

export function isBraincodeTheme(value: string): value is BraincodeTheme {
  return value === "dark" || value === "light";
}

export function tone(theme: TuiTheme, color: UiColor): string {
  return theme.colors[color];
}

export function readThemeOverride(): BraincodeTheme | undefined {
  const envTheme = process.env.BRAINCODE_THEME?.trim().toLowerCase();
  return isBraincodeTheme(envTheme ?? "")
    ? (envTheme as BraincodeTheme)
    : undefined;
}

export function detectSystemAppearanceTheme(): BraincodeTheme {
  const colorFgBg = process.env.COLORFGBG;
  const background = colorFgBg?.split(";").at(-1);
  const backgroundCode = background ? Number(background) : Number.NaN;
  if (Number.isFinite(backgroundCode)) {
    return backgroundCode >= 7 && backgroundCode !== 8 ? "light" : "dark";
  }

  if (process.platform === "darwin") {
    try {
      const output = execFileSync(
        "defaults",
        ["read", "-g", "AppleInterfaceStyle"],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      )
        .trim()
        .toLowerCase();
      return output.includes("dark") ? "dark" : "light";
    } catch {
      return "light";
    }
  }

  return "dark";
}

export function detectSystemTheme(): BraincodeTheme {
  return readThemeOverride() ?? detectSystemAppearanceTheme();
}
