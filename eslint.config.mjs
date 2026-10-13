import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Gavetas/diálogos do app reiniciam o formulário com os dados do registro ao abrir
      // (useEffect dependente do item aberto). É intencional e não gera renderização em cascata
      // perceptível; o restante das regras do React Compiler segue ativo.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**", ".local-pg/**", "public/sw.js"]),
]);

export default eslintConfig;
