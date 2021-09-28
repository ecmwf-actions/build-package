# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v2.0.0](https://github.com/ecmwf-actions/build-package/compare/v1.1.0...v2.0.0)

### Fixed

- Fixed #1: Magic file .compiler-flags can not be overridden. [`#1`](https://github.com/ecmwf-actions/build-package/issues/1)

### Commits

- Added support for checking out repository tags. [`ac214fb`](https://github.com/ecmwf-actions/build-package/commit/ac214fb20a6d514e8c0e2f38602f2b1bed6aca65)
- Added cache invalidation mechanism via cache_suffix input. [`a8da891`](https://github.com/ecmwf-actions/build-package/commit/a8da8919131dbe86eb378524f8f77d4284127682)
- Implemented ctest_options input. [`5243daf`](https://github.com/ecmwf-actions/build-package/commit/5243dafa989248aa709b2cc118a0a1a1b38df756)
- Split CMake options input into current repository and dependency specific ones. [`9cf6e6c`](https://github.com/ecmwf-actions/build-package/commit/9cf6e6cff6c0cc65e1d0b7324cc6d21157c0fefc)
- Improved parsing of CMake options. [`d02f692`](https://github.com/ecmwf-actions/build-package/commit/d02f692b24dbb341f5785ffd9ba9a6c0add94183)
- Added input for cache recreation. [`7949e28`](https://github.com/ecmwf-actions/build-package/commit/7949e28ce97fe9ad4c7d7bdac91014a898f14e65)
- Allowed overriding of default options via current environment variables. [`09d99ea`](https://github.com/ecmwf-actions/build-package/commit/09d99ea1ace4d65476b2215f3195a174745617e4)
- Fixed issue with missing dependency SHA keys when restoring from cache. [`90b3dd4`](https://github.com/ecmwf-actions/build-package/commit/90b3dd4dcd1e8b8302bbe93138ab8f554c8f7ddb)
- Abstracted building, test and install commands. [`ff352e8`](https://github.com/ecmwf-actions/build-package/commit/ff352e86a764f50c5f9e0f7dbb68c443eeab21cf)
- Added missing split of CMake options on spaces. [`57e8381`](https://github.com/ecmwf-actions/build-package/commit/57e8381da75e21a8eacc92af1b25cd9c4174904e)
- Bumped up dependency. [`aad8190`](https://github.com/ecmwf-actions/build-package/commit/aad81903d59022915ba1d3bd9a7169254ae0a2ee)
- Tidied. [`5c8d1d0`](https://github.com/ecmwf-actions/build-package/commit/5c8d1d037e20c3fbd66704bfafcfc33b57b131b2)
- Merge tag 'v1.1.0' into develop [`91cd585`](https://github.com/ecmwf-actions/build-package/commit/91cd585ffd6da505653fc920779a885ab066ed30)

## [v1.1.0](https://github.com/ecmwf-actions/build-package/compare/v1.0.4...v1.1.0) - 2021-09-08

### Commits

- Removed superfluous workflows. [`4bee22a`](https://github.com/ecmwf-actions/build-package/commit/4bee22a621a98beee263b269b553590d56011c0f)
- Extended build environment with common package path variables. [`f30d2a9`](https://github.com/ecmwf-actions/build-package/commit/f30d2a947629e51f6a81cc803272c7101ec6ebb9)
- Bumped up version to v1.1.0. [`b917dc1`](https://github.com/ecmwf-actions/build-package/commit/b917dc16c711e9e04c28735afe1054c80cfaab83)

## [v1.0.4](https://github.com/ecmwf-actions/build-package/compare/v1.0.3...v1.0.4) - 2021-09-01

### Commits

- Improved log messages. [`f1048e1`](https://github.com/ecmwf-actions/build-package/commit/f1048e189979b1e6e0d29f019d3f724cb4b35cab)
- Bumped up dependencies. [`d131e76`](https://github.com/ecmwf-actions/build-package/commit/d131e76f532d272f92e3417cbdc52aaacadc8639)
- Added auto changelog mechanism. [`425506a`](https://github.com/ecmwf-actions/build-package/commit/425506abd65b1091a9063a1c401b7e76e99e7f04)

## [v1.0.3](https://github.com/ecmwf-actions/build-package/compare/v1.0.2...v1.0.3) - 2021-08-05

### Commits

- Fixed duplicated repository name in cache key. [`329fb7f`](https://github.com/ecmwf-actions/build-package/commit/329fb7fc52c33b788c4adb972bfbd1ca2341a768)
- Improved error handling. [`64d952f`](https://github.com/ecmwf-actions/build-package/commit/64d952f3726a00c49bac2d77ba95516a7237378d)
- Updated cleanup workflow. [`342baaf`](https://github.com/ecmwf-actions/build-package/commit/342baaff1790959b00a1e7d3ef389655d38e72be)

## [v1.0.2](https://github.com/ecmwf-actions/build-package/compare/v1.0.1...v1.0.2) - 2021-08-05

### Commits

- Fixed wrong option name in Octokit constructor. [`5ba2fc0`](https://github.com/ecmwf-actions/build-package/commit/5ba2fc0f3d9f9dbd0a6e6a2efedf2fe7aab49034)
- Added Git pre-commit hook. [`1b9f307`](https://github.com/ecmwf-actions/build-package/commit/1b9f30738959d3b81cfbbabc1bd32f5f1b58e074)

## [v1.0.1](https://github.com/ecmwf-actions/build-package/compare/v1...v1.0.1) - 2021-08-05

## [v1](https://github.com/ecmwf-actions/build-package/compare/v1.0.0...v1) - 2021-09-08

### Commits

- Added consistency tracking mechanism for dependency artifacts. [`5affa2c`](https://github.com/ecmwf-actions/build-package/commit/5affa2cb0bca3aca42107f0278a047306115a9ea)
- Added commit SHA to the artifact name. [`9f2937d`](https://github.com/ecmwf-actions/build-package/commit/9f2937d505f60fa53be2d5900614df20785464c2)
- Added artifact filter for current repository HEAD. [`1b0a0c8`](https://github.com/ecmwf-actions/build-package/commit/1b0a0c8c72de2bf58782621e639e9ca7c6492009)

## v1.0.0 - 2021-08-03

### Commits

- Implemented action in JavaScript. [`c7cabfe`](https://github.com/ecmwf-actions/build-package/commit/c7cabfe840d755a05b1411ebbf77c06a18eee9ad)
- Initial commit [`fdaa4f5`](https://github.com/ecmwf-actions/build-package/commit/fdaa4f5689f9c6dc9fa0311652420f610ae2c985)
- Updated README. [`f66a682`](https://github.com/ecmwf-actions/build-package/commit/f66a682e6c274b56d66b63ab6dfce34a4a75a7a3)
