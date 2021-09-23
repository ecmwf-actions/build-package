# build-package

[![Changelog](https://img.shields.io/github/package-json/v/ecmwf-actions/build-package)](CHANGELOG.md)
[![Build Status](https://img.shields.io/github/workflow/status/ecmwf-actions/build-package/ci/main)](https://github.com/ecmwf-actions/build-package/actions/workflows/ci.yml?query=branch:main)
[![Code Coverage](https://img.shields.io/codecov/c/gh/ecmwf-actions/build-package/main)](https://codecov.io/gh/ecmwf-actions/build-package)
[![Licence](https://img.shields.io/github/license/ecmwf-actions/build-package)](https://github.com/ecmwf-actions/build-package/blob/main/LICENSE)

A Github action to build ECMWF software.

## Features

* Supports ecbuild/CMake-based projects
* Supports multiple dependencies, with different branch names
* Dependencies are installed either through artifacts or local builds
* Automated caching of locally built dependencies
* Automated upload of build artifacts
* Self building of checked out repositories (optional)
* Running tests (optional)
* Code coverage collection (optional)

## Supported Operating Systems

* Linux
* macOS

## Usage

### With Code Coverage Collection

```yaml
steps:
- name: Checkout Repository
  uses: actions/checkout@v2

- name: Build & Test
  uses: ecmwf-actions/build-package@v1
  with:
    self_coverage: true
    dependencies: |
      ecmwf/ecbuild
      ecmwf/eckit
    dependency_branch: develop
```

### With Custom CMake Options

```yaml
steps:
- name: Checkout Repository
  uses: actions/checkout@v2

- name: Build & Test
  uses: ecmwf-actions/build-package@v1
  with:
    cmake: true
    cmake_options: -DCMAKE_BUILD_TYPE=Debug
    dependencies: ecmwf/ecbuild
    dependency_cmake_options: |
      ecmwf/ecbuild: "-DCMAKE_BUILD_TYPE=Debug"
    dependency_branch: develop
```

### Without Test Run

```yaml
steps:
- name: Checkout Repository
  uses: actions/checkout@v2

- name: Build
  uses: ecmwf-actions/build-package@v1
  with:
    self_test: false
```

### With Dependencies Only

```yaml
steps:
- name: Checkout Repository
  uses: actions/checkout@v2

- name: Install Dependencies
  id: install-dependencies
  uses: ecmwf-actions/build-package@v1
  with:
    self_build: false
    dependencies: |
      ecmwf/ecbuild@master
      ecmwf/eckit
      ecmwf/odc
    dependency_branch: develop

- name: Setup Python
  uses: actions/setup-python@v2
  with:
    python-version: 3.x

- name: Install Python Dependencies
  run: python -m pip install -r requirements.txt

- name: Run Tests
  env:
    LD_LIBRARY_PATH: ${{ steps.install-dependencies.outputs.lib_path }}
  shell: bash -eux {0}
  run: DYLD_LIBRARY_PATH=${{ env.LD_LIBRARY_PATH }} python -m pytest
```

## Inputs

### `workspace`

**Required** The location of currently checked out source repository.  
**Default:** `${{ github.workspace }}`

### `repository`

**Required** The currently checked out source repository name. Repository names should follow the standard Github `owner/name` format.  
**Default:** `${{ github.repository }}`

### `sha`

**Required** The currently checked out source repository commit SHA.  
**Default:** `${{ github.sha }}`

### `cmake`

**Required** Whether to use CMake for build configuration, instead of ecbuild.  
**Default:** `false`

### `cmake_options`

The list of ecbuild/CMake options to be passed during the current repository build configuration phase. Use the form of `-DCMAKE_VAR=1 -DCMAKE_ANOTHER_VAR=0` to define multiple options. If left empty, the repository will be configured with default options only.

> **NOTE:**  
To make sure that the options are also applied when the repository is built as a dependency, you can instead of this input provide a file under magic path `.github/.cmake-options`. Use the same form for options and take care the file does not contain line breaks.

### `self_build`

**Required** Whether to build from currently checked out repository or not.  
**Default:** `true`

### `self_test`

**Required** Whether to run tests from currently checked out repository or not.  
**Default:** `true`

### `self_coverage`

**Required** Whether to collect code coverage from currently checked out repository or not. Note that [test](#test) input must be set to true for this to work. Currently supported only on Ubuntu 20.04 platform and for GNU 10 compiler.  
**Default:** `false`

### `dependencies`

The list of dependency repositories to build from, in correct order. Repository names should follow the standard Github `owner/name` format. To specify different branch name per repository, use `owner/name@branch_name` format.  
**Multiline Support:** yes

### `dependency_branch`

**Required** The default branch name for dependency repositories. Will be ignored if the branch name is specified per repository, see [dependencies](#dependencies) input.  
**Default:** `${{ github.ref }}`

### `dependency_cmake_options`

The list of ecbuild/CMake options to be passed during the dependency build configuration phase. Use the form of `owner/name: "-DCMAKE_VAR=1"` to define options for the package or its dependencies. If the package is not listed, it will be configured with default options only.  
**Multiline Support:** yes

### `force_build`

**Required** Whether to always build dependencies from latest repository states or not. Otherwise, the action will first try to download a build artifact if it exists.  
**Default:** `false`

### `cache_suffix`

A string which will be appended to the cache key. To invalidate the build cache, simply change its value.  

### `recreate_cache`

**Required** Whether to skip restoring builds from cache and recreate them instead.  
**Default:** `false`

### `os`

**Required** Current OS platform.  
**Default:** `${{ matrix.os }}`

### `compiler`

Current compiler family.  
**Default:** `${{ matrix.compiler }}`

### `compiler_cc`

Current C compiler alias.  
**Default:** `${{ matrix.compiler_cc }}`

### `compiler_cxx`

Current C++ compiler alias.  
**Default:** `${{ matrix.compiler_cxx }}`

### `compiler_fc`

Current Fortran compiler alias.  
**Default:** `${{ matrix.compiler_fc }}`

### `github_token`

**Required** Github access token, with `repo` and `actions:read` scopes.  
**Default:** `${{ github.token }}`

### `install_dir`

**Required** Directory where the dependencies and current package will be installed. Each dependency will be installed in its own subdirectory.  
**Default:** `${{ runner.temp }}/install`

### `download_dir`

**Required** Directory where the dependency repositories and artifacts will be downloaded.  
**Default:** `${{ runner.temp }}/download`

## Outputs

### `bin_paths`
Binary paths of all installed packages, delimited by colons (:).  
**Example:** `${{ runner.temp }}/install/repo1/bin:${{ runner.temp }}/install/repo2/bin`

### `include_path`
Include paths of all installed packages, delimited by colons (:)  
**Example:** `${{ runner.temp }}/install/repo1/include:${{ runner.temp }}/install/repo2/include`

### `install_path`
Install paths of all installed packages, delimited by colons (:)  
**Example:** `${{ runner.temp }}/install/repo1:${{ runner.temp }}/install/repo2`

### `lib_path`
Library paths of all installed packages, delimited by colons (:)  
**Example:** `${{ runner.temp }}/install/repo1/lib:${{ runner.temp }}/install/repo2/lib`

### `coverage_file`
Absolute path to code coverage file, if collected.  
**Example:** `${{ github.workspace }}/repo/repo/build/coverage.info`

## Code Coverage Report

> Note that the support for code coverage collection is currently available only on the Ubuntu 20.04 platform with GNU 10 compiler.

An artifact with the generated code coverage HTML report will be uploaded if the job was successful.

To post-process the code coverage file in a later step, you can refer to it via [coverage_file](#coverage_file) output:

```yaml
- name: Build & Test
  id: build-test
  uses: ecmwf-actions/build-package@v1
  with:
    self_coverage: true
    dependencies: |
      ecmwf/ecbuild
      ecmwf/eckit
    dependency_branch: develop

- name: Codecov Upload
  if: steps.build-test.outputs.coverage_file && (github.ref == 'refs/heads/master' || github.ref == 'refs/heads/develop')
  uses: codecov/codecov-action@v2
  with:
    files: ${{ steps.build-test.outputs.coverage_file }}
```

## Development

### Install Dependencies

```
npm install
```

A post-install script will deploy Git pre-commit hook, that conveniently runs a lint check, builds the action and stages the changes. To skip the hook, simply add `--no-verify` switch to the Git commit command.

### Build Action

This action transpiles its code into a self-contained script, pulling in all of its dependencies. This will happen automatically by the installed pre-commit hook, but in case you do not have it install just make sure to run the build command manually after _any_ changes and stage `dist/` directory.

```
npm run build
```

### Lint Code

```
npm run lint
```

### Run Tests

```
npm test
```

## Licence

This software is licensed under the terms of the Apache License Version 2.0 which can be obtained at http://www.apache.org/licenses/LICENSE-2.0.

In applying this licence, ECMWF does not waive the privileges and immunities granted to it by virtue of its status as an intergovernmental organisation nor does it submit to any jurisdiction.
