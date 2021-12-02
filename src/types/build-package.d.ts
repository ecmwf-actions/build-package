type BuildOptions = Record<string, string[]>;

export default function buildPackage(repository: string, sourceDir: string, installDir: string, cmake: boolean, cmakeOptions: string | null, ctestOptions: string | null, test: boolean, codeCoverage: boolean, os: string, compiler: string, env: { [key: string]: string }): boolean;
