import eslint from "@eslint/js";
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import {
  createNodeResolver,
  flatConfigs as importX,
} from "eslint-plugin-import-x";
import jest from "eslint-plugin-jest";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "src/protobuf/", "src/quicktype/"] },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  importX.recommended,
  importX.typescript,
  comments.recommended,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver(),
        createNodeResolver(),
      ],
    },
    rules: {
      // False positives on CommonJS default imports such as pino and pulsar-client.
      "import-x/no-named-as-default": "off",
      "import-x/no-named-as-default-member": "off",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["**/*.test.ts"],
    extends: [jest.configs["flat/recommended"]],
  },
  prettierRecommended
);
