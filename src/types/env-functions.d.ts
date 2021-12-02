// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EnvironmentVariables = Record<string, any>;
export function setupEnv(os: string, compilerCc: string | null, compilerCxx: string | null, compilerFc: string): Promise<EnvironmentVariables>;
export function extendPaths(env: EnvironmentVariables | null, installDir: string, packageName: string): void;
export function extendDependencies(env: EnvironmentVariables | null, repository: string, sha: string): void;
