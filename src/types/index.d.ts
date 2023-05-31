type ActionInputs = {
    workspace: string,
    repository: string,
    cmake: boolean,
    cmake_options: string | null,
    self_build: boolean,
    self_test: boolean,
    self_coverage: boolean,
    dependencies: string[],
    dependency_branch: string,
    force_build: boolean,
    cache_suffix: string | null,
    recreate_cache: boolean,
    os: string,
    compiler: string,
    compiler_cc: string | null,
    compiler_cxx: string | null,
    compiler_fc: string,
    github_token: string,
    install_dir: string,
    download_dir: string,
    parallelism_factor: string;
    [key: string]: string[] | boolean | string | null,
};

type ActionOutputs = {
    bin_path: string,
    include_path: string,
    install_path: string,
    lib_path: string,
    coverage_file?: string,
    package_path?: string,
};
