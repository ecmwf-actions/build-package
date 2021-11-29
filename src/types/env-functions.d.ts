type EnvironmentVariables = Record<string, string>;
export function setupEnv(os: string, compilerCc: string, compilerCxx: string, compilerFc: string): Promise<EnvironmentVariables>;
export function extendPaths(env: EnvironmentVariables, installDir: string, packageName: string): void;
export function extendDependencies(env: EnvironmentVariables, repository: string, sha: string): void;
