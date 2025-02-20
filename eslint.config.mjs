import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import vitestPlugin from "eslint-plugin-vitest";
import jsonSchemaPlugin from "eslint-plugin-json-schema-validator";
import ymlPlugin from "eslint-plugin-yml";
import yamlParser from "yaml-eslint-parser";
import prettierConfig from "eslint-config-prettier";

export default [
    {
        ignores: ["dist/**"],
    },
    prettierConfig,
    {
        files: ["**/*.{js,ts,mjs}"],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 12,
            },
            sourceType: "module",
            globals: {
                node: true,
                commonjs: true,
                es2021: true,
            },
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
            vitest: vitestPlugin,
            "json-schema-validator": jsonSchemaPlugin,
            yml: ymlPlugin,
        },
        rules: {
            "json-schema-validator/no-invalid": [
                "error",
                {
                    useSchemastoreCatalog: true,
                },
            ],
        },
    },
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parserOptions: {
                project: ["./tsconfig.json"],
            },
        },
    },
    {
        files: ["tests/**"],
        rules: {
            "vitest/expect-expect": "error",
            "vitest/no-disabled-tests": "warn",
            "vitest/no-focused-tests": "error",
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
    {
        files: ["**/*.{yaml,yml}"],
        languageOptions: {
            parser: yamlParser,
            parserOptions: {
                defaultYAMLVersion: "1.2",
            },
        },
        plugins: {
            yml: ymlPlugin,
        },
    },
];
