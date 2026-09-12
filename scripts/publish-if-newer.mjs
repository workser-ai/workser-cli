import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const { name, version: localVersion } = packageJson;

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  return {
    numbers: match.slice(1, 4).map(Number),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);

  for (let index = 0; index < a.numbers.length; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) {
      return a.numbers[index] - b.numbers[index];
    }
  }

  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return a.prerelease.length - b.prerelease.length;
  }

  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const aPart = a.prerelease[index];
    const bPart = b.prerelease[index];
    if (aPart === undefined || bPart === undefined) {
      return aPart === undefined ? -1 : 1;
    }
    if (aPart === bPart) {
      continue;
    }

    const aNumber = /^\d+$/.test(aPart);
    const bNumber = /^\d+$/.test(bPart);
    if (aNumber && bNumber) {
      return Number(aPart) - Number(bPart);
    }
    if (aNumber !== bNumber) {
      return aNumber ? -1 : 1;
    }
    return aPart.localeCompare(bPart);
  }

  return 0;
}

async function getPublishedVersion() {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`);
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`Unable to read the npm registry: ${response.status} ${response.statusText}`);
  }

  const publishedPackage = await response.json();
  return publishedPackage.version;
}

const publishedVersion = await getPublishedVersion();
if (publishedVersion && compareVersions(localVersion, publishedVersion) <= 0) {
  console.log(`Skipping publish: local version ${localVersion} is not newer than npm version ${publishedVersion}.`);
} else {
  if (!process.env.WORKSER_NPM) {
    throw new Error("WORKSER_NPM must be set to publish a newer package version.");
  }

  const npmConfigDirectory = await mkdtemp(join(tmpdir(), "workser-npm-"));
  const npmConfigPath = join(npmConfigDirectory, ".npmrc");

  try {
    await writeFile(npmConfigPath, `//registry.npmjs.org/:_authToken=${process.env.WORKSER_NPM}\n`, {
      mode: 0o600,
    });

    const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["publish"], {
      env: { ...process.env, NPM_CONFIG_USERCONFIG: npmConfigPath },
      stdio: "inherit",
    });

    if (result.error) {
      throw result.error;
    }
    process.exitCode = result.status ?? 1;
  } finally {
    await rm(npmConfigDirectory, { force: true, recursive: true });
  }
}
