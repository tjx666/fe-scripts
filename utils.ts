import { exec as _exec } from 'node:child_process';
import { constants as FS_CONSTANTS } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import boxen from 'boxen';
import { createConsola } from 'consola';
import type { Options as ExecaOptions } from 'execa';
import { execa } from 'execa';
import c from 'picocolors';
import semver from 'semver';

import type _rootPkg from '../package.json';

export const consola = createConsola({
    fancy: true,
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(__dirname, '..');
export const lockMultipleVersionDeps = ['axios', 'core-js'] as const;

type RootPkg = typeof _rootPkg;
const rootPkg: RootPkg = JSON.parse(
    await fs.readFile(path.resolve(__dirname, '../package.json'), 'utf8'),
);
export type OverridesKey = (typeof lockMultipleVersionDeps)[number] | keyof typeof overrides;
const { overrides } = rootPkg.pnpm;
const overridesKeys = Object.keys(overrides) as OverridesKey[];
overridesKeys.push(...lockMultipleVersionDeps);
export { overrides, overridesKeys };

export function isESMain(meta: any) {
    return meta.url === `file://${process.argv[1]}`;
}

export function getLockedVersion(packageName: OverridesKey, oldVersion: string) {
    if (packageName === 'axios') {
        return overrides[semver.lt(oldVersion, '1.0.0') ? 'axios@<1' : 'axios@1'];
    } else if (packageName === 'core-js') {
        return overrides[semver.lt(oldVersion, '3.0.0') ? 'core-js@<3' : 'core-js@3'];
    }

    return overrides[packageName];
}

export function colorizeVersionDiff(from: string, to: string, highlightRange = true) {
    let leadingWildcard = '';
    let fromLeadingWildcard = '';

    // separate out leading ^ or ~
    if (/^[^~]/.test(to)) {
        leadingWildcard = to[0];
        to = to.slice(1);
    }
    if (/^[^~]/.test(from)) {
        fromLeadingWildcard = from[0];
        from = from.slice(1);
    }

    // split into parts
    const partsToColor = to.split('.');
    const partsToCompare = from.split('.');

    let i = partsToColor.findIndex((part, i) => part !== partsToCompare[i]);
    i = i >= 0 ? i : partsToColor.length;

    // major = red (or any change before 1.0.0)
    // minor = cyan
    // patch = green
    const color = i === 0 || partsToColor[0] === '0' ? 'red' : i === 1 ? 'cyan' : 'green';

    // if we are colorizing only part of the word, add a dot in the middle
    const midDot = i > 0 && i < partsToColor.length ? '.' : '';

    const leadingColor =
        leadingWildcard === fromLeadingWildcard || !highlightRange ? 'gray' : 'yellow';

    return (
        c[leadingColor](leadingWildcard) +
        partsToColor.slice(0, i).join('.') +
        midDot +
        c[color](partsToColor.slice(i).join('.')).trim()
    );
}

export async function pathExists(
    filePath: string,
    fileNameCaseSensitive = false,
): Promise<boolean> {
    if (fileNameCaseSensitive) {
        const fileName = path.basename(filePath);
        const directory = filePath.replace(fileName, '');
        try {
            // 如果 directory 不存在这里会直接报错
            const fileNames = await fs.readdir(directory);
            return fileNames.includes(fileName);
        } catch {
            return false;
        }
    } else {
        return fs
            .access(filePath, FS_CONSTANTS.F_OK)
            .then(() => true)
            .catch(() => false);
    }
}

export async function execaWithOutput(
    cmd: string,
    args: string[],
    options?: ExecaOptions & { outputCommand?: boolean },
) {
    if (options?.outputCommand !== false) {
        const commandStr = [cmd, ...args].join(' ');
        console.log(c.dim(`$ ${commandStr}`));
    }

    const subprocess = execa(cmd, args, {
        cwd: projectRoot,
        preferLocal: true,
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
        ...options,
        env: { FORCE_COLOR: 'true', ...options?.env },
    });

    return subprocess;
}

export async function getExecOutput(cmd: string, args: string[], options?: ExecaOptions) {
    const { stdout } = await execa(cmd, args, options);
    return stdout;
}

export async function runCommand(command: string, options?: ExecaOptions) {
    const [exe, ...args] = command.split(/\s+/);
    return execaWithOutput(exe, args, options);
}

/**
 * 检查运行一个命令是否有输出
 */
export async function checkExecOutput(command: string, cwd = projectRoot) {
    const childProcess = _exec(command, { cwd });
    let completed = false;
    return new Promise<boolean>((resolve, reject) => {
        childProcess.stdout!.addListener('data', () => {
            completed = true;
            childProcess.kill();
            resolve(true);
        });

        childProcess.addListener('exit', (code) => {
            if (completed) return;

            if (code !== 0) {
                reject(new Error(`execute "${command}" failed, code: ${code}`));
                return;
            }
            resolve(false);
        });

        childProcess.addListener('error', (err) => {
            reject(err);
        });
    });
}

export async function getFileStatus(filePath: string) {
    const { stdout } = await execa('git', ['status', '--porcelain', filePath]);
    return stdout.trim();
}

export async function modifyJsonFile(jsonFilePath: string, modifyOperation: (jsonObj: any) => any) {
    const json = await fs.readFile(jsonFilePath, 'utf8');
    const newJsonObj = await modifyOperation(JSON.parse(json));
    await fs.writeFile(jsonFilePath, JSON.stringify(newJsonObj, null, 4));
}

export async function replaceTextFileContent(
    textFilePath: string,
    replacementList: Array<[RegExp | string, string]>,
) {
    let textContent = await fs.readFile(textFilePath, 'utf8');
    for (const replacement of replacementList) {
        textContent = textContent.replaceAll(replacement[0], replacement[1]);
    }
    await fs.writeFile(textFilePath, textContent, 'utf8');
    return textContent;
}

export async function gitAdd(filePath: string) {
    return execa('git', ['add', filePath], {
        cwd: projectRoot,
    });
}

/**
 * @param duration 单位 ms
 */
export function formatDuration(duration: number) {
    if (duration < 3000) {
        return c.green(`${duration}ms`);
    } else if (duration < 10000) {
        return c.yellow(`${(duration / 1000).toFixed(3)}s`);
    } else {
        return c.red(`${(duration / 1000).toFixed(3)}s`);
    }
}

export function logWithBox(title: string, message: string) {
    console.log(
        boxen(`${title}\n\n${message}`, {
            padding: 1,
            margin: 1,
            align: 'center',
            borderColor: 'yellow',
            borderStyle: 'round',
        }),
    );
}
