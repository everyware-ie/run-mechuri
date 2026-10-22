// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // 2026-09-21: React Compiler 린트 규칙 3개를 error에서 warn으로 낮춘다.
    // PanResponder를 ref에 담아 두는 패턴(edit.tsx, slider.tsx)과 hydration용
    // setState-in-effect(use-color-scheme.web.ts)는 여러 세션에 걸쳐 "허용
    // 중인 오탐"으로 문서에 남아 있던 것들이다 — 코드를 고치는 대신(잘 동작하는
    // 걸 굳이 바꾸는 위험을 감수하느니) CI(2026-09-21 도입)가 이 기존 노이즈로
    // 매번 막히지 않게 규칙 강도만 팀이 실제로 해온 대로(보이되 막지 않음) 맞춘다.
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);
