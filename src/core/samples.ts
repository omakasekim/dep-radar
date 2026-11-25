export const SAMPLE_PACKAGE_LOCK = JSON.stringify(
  {
    name: 'chronos-web-stack',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'chronos-web-stack',
        dependencies: {
          next: '15.5.0',
          axios: '1.7.9',
          sharp: '0.33.5',
          execa: '9.5.1',
          zod: '3.23.8',
        },
      },
      'node_modules/next': {
        version: '15.5.0',
        license: 'MIT',
        dependencies: { react: '18.3.1', postcss: '8.4.49', '@swc/core': '1.9.3' },
      },
      'node_modules/react': {
        version: '18.3.1',
        license: 'MIT',
        dependencies: { 'loose-envify': '1.4.0' },
      },
      'node_modules/loose-envify': { version: '1.4.0', license: 'MIT', dependencies: { 'js-tokens': '4.0.0' } },
      'node_modules/js-tokens': { version: '4.0.0', license: 'MIT' },
      'node_modules/postcss': { version: '8.4.49', license: 'MIT', dependencies: { nanoid: '3.3.7', picocolors: '1.1.1' } },
      'node_modules/nanoid': { version: '3.3.7', license: 'MIT' },
      'node_modules/picocolors': { version: '1.1.1', license: 'ISC' },
      'node_modules/@swc/core': { version: '1.9.3', license: 'Apache-2.0', hasInstallScript: true },
      'node_modules/axios': {
        version: '1.7.9',
        license: 'MIT',
        dependencies: { 'follow-redirects': '1.15.9', 'form-data': '4.0.1' },
      },
      'node_modules/follow-redirects': { version: '1.15.9', license: 'MIT', dependencies: { debug: '4.3.7' } },
      'node_modules/form-data': { version: '4.0.1', license: 'MIT', dependencies: { 'asynckit': '0.4.0' } },
      'node_modules/asynckit': { version: '0.4.0', license: 'MIT' },
      'node_modules/debug': { version: '4.3.7', license: 'MIT', dependencies: { ms: '2.1.3' } },
      'node_modules/ms': { version: '2.1.3', license: 'MIT' },
      'node_modules/sharp': {
        version: '0.33.5',
        license: 'Apache-2.0',
        hasInstallScript: true,
        dependencies: { color: '4.2.3', semver: '7.6.3', 'detect-libc': '2.0.3' },
      },
      'node_modules/color': { version: '4.2.3', license: 'MIT', dependencies: { 'color-convert': '2.0.1' } },
      'node_modules/color-convert': { version: '2.0.1', license: 'MIT' },
      'node_modules/semver': { version: '7.6.3', license: 'ISC' },
      'node_modules/detect-libc': { version: '2.0.3', license: 'Apache-2.0' },
      'node_modules/execa': {
        version: '9.5.1',
        license: 'MIT',
        dependencies: { 'cross-spawn': '7.0.6', 'strip-final-newline': '4.0.0', ms: '2.1.2' },
      },
      'node_modules/execa/node_modules/ms': { version: '2.1.2', license: 'MIT' },
      'node_modules/cross-spawn': { version: '7.0.6', license: 'MIT', dependencies: { 'which': '2.0.2', 'shebang-command': '2.0.0' } },
      'node_modules/which': { version: '2.0.2', license: 'ISC' },
      'node_modules/shebang-command': { version: '2.0.0', license: 'MIT' },
      'node_modules/strip-final-newline': { version: '4.0.0', license: 'MIT' },
      'node_modules/zod': { version: '3.23.8', license: 'MIT', dependencies: { 'fast-deep-equal': '3.1.3' } },
      'node_modules/fast-deep-equal': { version: '3.1.3', license: 'MPL-2.0' },
    },
  },
  null,
  2,
);

export const SAMPLE_CARGO_LOCK = `# Sample Cargo.lock workspace
[[package]]
name = "vault-daemon"
version = "0.2.0"
dependencies = [
  "tokio",
  "reqwest",
  "ring",
  "zeroize",
]

[[package]]
name = "tokio"
version = "1.42.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
dependencies = ["libc", "mio", "pin-project-lite"]

[[package]]
name = "libc"
version = "0.2.164"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "mio"
version = "1.0.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
dependencies = ["libc"]

[[package]]
name = "pin-project-lite"
version = "0.2.15"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "reqwest"
version = "0.12.9"
source = "registry+https://github.com/rust-lang/crates.io-index"
dependencies = ["hyper", "rustls", "tokio"]

[[package]]
name = "hyper"
version = "1.5.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
dependencies = ["tokio", "http"]

[[package]]
name = "http"
version = "1.1.0"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "rustls"
version = "0.23.18"
source = "registry+https://github.com/rust-lang/crates.io-index"
dependencies = ["ring", "zeroize"]

[[package]]
name = "ring"
version = "0.17.8"
source = "registry+https://github.com/rust-lang/crates.io-index"
dependencies = ["cc", "libc"]

[[package]]
name = "cc"
version = "1.2.1"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "zeroize"
version = "1.8.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
`;

export const SAMPLE_UV_LOCK = `version = 1

[[package]]
name = "inference-api"
version = "0.1.0"
dependencies = [
  { name = "fastapi" },
  { name = "httpx" },
  { name = "numpy" },
]

[[package]]
name = "fastapi"
version = "0.115.6"
source = { registry = "https://pypi.org/simple" }
dependencies = [{ name = "starlette" }, { name = "pydantic" }]

[[package]]
name = "starlette"
version = "0.41.3"
source = { registry = "https://pypi.org/simple" }
dependencies = [{ name = "anyio" }]

[[package]]
name = "pydantic"
version = "2.10.3"
source = { registry = "https://pypi.org/simple" }
dependencies = [{ name = "pydantic-core" }]

[[package]]
name = "pydantic-core"
version = "2.27.1"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "httpx"
version = "0.28.1"
source = { registry = "https://pypi.org/simple" }
dependencies = [{ name = "anyio" }, { name = "httpcore" }, { name = "certifi" }]

[[package]]
name = "httpcore"
version = "1.0.7"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "anyio"
version = "4.7.0"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "certifi"
version = "2024.12.14"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "numpy"
version = "2.2.1"
source = { registry = "https://pypi.org/simple" }
`;

export const SAMPLE_PNPM_LOCK = `lockfileVersion: '9.0'

importers:
  .:
    dependencies:
      vite:
        specifier: ^5.4.0
        version: 5.4.11
      esbuild:
        specifier: ^0.24.0
        version: 0.24.0
      drizzle-orm:
        specifier: ^0.36.0
        version: 0.36.4

packages:
  vite@5.4.11:
    resolution: {integrity: sha512-vite}
  rollup@4.27.4:
    resolution: {integrity: sha512-rollup}
  esbuild@0.24.0:
    resolution: {integrity: sha512-esbuild}
    hasBin: true
  postcss@8.4.49:
    resolution: {integrity: sha512-postcss}
  nanoid@3.3.7:
    resolution: {integrity: sha512-nanoid}
  drizzle-orm@0.36.4:
    resolution: {integrity: sha512-drizzle}
  pg@8.13.1:
    resolution: {integrity: sha512-pg}
  pg-pool@3.7.0:
    resolution: {integrity: sha512-pgpool}
  pg-protocol@1.7.0:
    resolution: {integrity: sha512-pgproto}

snapshots:
  vite@5.4.11:
    dependencies:
      esbuild: 0.24.0
      postcss: 8.4.49
      rollup: 4.27.4
  postcss@8.4.49:
    dependencies:
      nanoid: 3.3.7
  drizzle-orm@0.36.4:
    dependencies:
      pg: 8.13.1
  pg@8.13.1:
    dependencies:
      pg-pool: 3.7.0
      pg-protocol: 1.7.0
`;
