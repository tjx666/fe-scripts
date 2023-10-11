import fs from 'node:fs/promises';
import path, { relative, resolve } from 'node:path';

import type { Project } from '@pnpm/find-workspace-packages';
import { findWorkspacePackagesNoCheck } from '@pnpm/find-workspace-packages';
import c from 'picocolors';

import type { OverridesKey } from './utils';
import {
    colorizeVersionDiff,
    consola,
    getLockedVersion,
    gitAdd,
    isESMain,
    lockMultipleVersionDeps,
    logWithBox,
    overrides,
    overridesKeys,
    pathExists,
    projectRoot,
} from './utils';

const autoFix = Boolean(process.argv.includes('--fix'));

const updatedDepsMap: Map<string, Map<string, [string, string]>> = new Map();
// ai 用的版本和 design 用的不一样
const ignoreSyncedPackages = new Set(['xxx']);
const filesToAdd = new Set<string>();
/**
 * 同步 web-module.json 中 packages 的依赖版本为 root package.json 中 pnpm.overrides 锁定的版本
 */
async function syncWebModules(pkgs: Project[]) {
    const lockMultipleVersionDepSet = new Set<string>(lockMultipleVersionDeps);
    return Promise.all(
        pkgs.map(async (pkg) => {
            const webModulePath = path.resolve(pkg.dir, 'web-module.json');
            if (!(await pathExists(webModulePath))) return;

            const updatedDeps: Map<string, [string, string]> = new Map();
            const webModule = JSON.parse(await fs.readFile(webModulePath, 'utf8'));
            const { dependencies = {}, devDependencies = {} } = webModule;

            const updateDeps = (deps: Record<string, string>) => {
                for (const dep of Object.keys(deps)) {
                    if (lockMultipleVersionDepSet.has(dep)) {
                        console.error(`${dep} 目前依赖多个版本，不应该被指向单一版本！`);
                        process.exit(1);
                    }

                    if (dep in overrides) {
                        const version = deps[dep];
                        const lockedVersion = getLockedVersion(dep as OverridesKey, version);
                        const _overrides = overrides as Record<string, string>;
                        if (deps[dep] !== lockedVersion) {
                            updatedDeps.set(dep, [deps[dep], _overrides[dep]]);
                            deps[dep] = _overrides[dep];
                        }
                    } else if (!ignoreSyncedPackages.has(dep)) {
                        consola.error(
                            `没有在 root package.json 的 pnpm.overrides 中锁定 ${dep} 版本`,
                        );
                        process.exit(2);
                    }
                }
            };
            updateDeps(dependencies);
            updateDeps(devDependencies);

            if (updatedDeps.size > 0) {
                const webModuleRelativePath = relative(projectRoot, webModulePath);
                if (autoFix) {
                    await fs.writeFile(
                        webModulePath,
                        `${JSON.stringify(webModule, null, 4)}\n`,
                        'utf8',
                    );
                    filesToAdd.add(webModuleRelativePath);
                }
                updatedDepsMap.set(webModuleRelativePath, updatedDeps);
            }
        }),
    );
}

/**
 * 同步 workspace 中 packages 的依赖版本为 root package.json 中 pnpm.overrides 锁定的版本
 */
async function syncPackages(pkgs: Project[]) {
    return Promise.all(
        pkgs.map(async (pkg) => {
            const { dependencies, devDependencies, peerDependencies } = pkg.manifest;
            const updatedDeps: Map<string, [string, string]> = new Map();

            const syncDeps = (deps: Record<string, string> | undefined) => {
                if (!deps) return;

                for (const dep of overridesKeys) {
                    if (deps && dep in deps) {
                        const version = deps[dep];
                        const startsWithCaret = version.startsWith('^');
                        const trimmedCaretVersion = version.slice(startsWithCaret ? 1 : 0);
                        const lockedVersion = getLockedVersion(dep, trimmedCaretVersion);
                        const newVersion =
                            lockedVersion.startsWith('http') ||
                            lockedVersion.startsWith('workspace:')
                                ? lockedVersion
                                : `^${lockedVersion}`;
                        if (version !== newVersion) {
                            updatedDeps.set(dep, [version, newVersion]);
                            deps[dep] = newVersion;
                        }
                    }
                }
            };
            syncDeps(dependencies);
            syncDeps(peerDependencies);
            syncDeps(devDependencies);

            if (updatedDeps.size > 0) {
                const pkgJsonPath = relative(projectRoot, resolve(pkg.dir, 'package.json'));
                if (autoFix) {
                    await pkg.writeProjectManifest(pkg.manifest);
                    filesToAdd.add(pkgJsonPath);
                }
                updatedDepsMap.set(pkgJsonPath, updatedDeps);
            }
        }),
    );
}

/**
 * 更新 packages 中版本和 root package.json 中 pnpm.overrides 的版本保持相同
 */
export async function syncOverrides() {
    const pkgs = await findWorkspacePackagesNoCheck(projectRoot);
    await Promise.all([await syncWebModules(pkgs), await syncPackages(pkgs)]);
    if (autoFix) {
        for (const file of filesToAdd) {
            // 不能并发跑，git 不支持多个 git 进程同时 add
            // eslint-disable-next-line no-await-in-loop
            await gitAdd(file);
        }
    }

    if (!autoFix && updatedDepsMap.size > 0) {
        consola.error(
            '由于已经在 xxx/package.json 的 pnpm.overrides 锁定了依赖的版本，请手动更新以下依赖的版本号：',
        );
        for (const [packagePath, updatedDeps] of updatedDepsMap.entries()) {
            console.log(`\n${c.underline(packagePath)}`);
            for (const [dep, [oldVersion, newVersion]] of updatedDeps.entries()) {
                const dimOldVersion = c.dim(`${oldVersion} ->`);
                const highlightedNewVersion = colorizeVersionDiff(oldVersion, newVersion);
                console.log(`  ${dep}: ${dimOldVersion} ${highlightedNewVersion}`);
            }
        }
        process.stdout.write('\n');
        const title = c.red('请在本地运行下面的自动修复命令！');
        const autoFixCommand = c.magenta('tsx scripts/sync-overrides.ts --fix');
        const readMore = `Read more: ${c.green('https://pnpm.io/package_json#pnpmoverrides')}`;
        const fixMessage = `${autoFixCommand}\n\n${readMore}`;
        logWithBox(title, fixMessage);
        process.exit(1);
    }
}

if (isESMain(import.meta)) {
    syncOverrides();
}
