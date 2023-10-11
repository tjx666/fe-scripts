import { createRequire } from 'node:module';

import type { ExecaError } from 'execa';
import { execa } from 'execa';
import micromatch from 'micromatch';
import c from 'picocolors';

import { consola, execaWithOutput, formatDuration, logWithBox } from './utils';

const baseBranch = process.env.CHANGE_TARGET || 'master';
consola.info(`Base Branch：${baseBranch}`);
process.stdout.write('\n');

const require = createRequire(import.meta.url);
const lintStagedConfig = require('../lint-staged.config') as Record<
    string,
    (files: string[]) => string
>;

/**
 * @see https://github.com/okonet/lint-staged/blob/master/lib/getDiffCommand.js
 */
async function getChangedFiles() {
    const { stdout } = await execa('git', [
        'diff',
        '--name-only',
        // 排除删除了的文件
        '--diff-filter=ACMR',
        `${baseBranch}...HEAD`,
    ]);
    return stdout.trim().split(/\r?\n/);
}

const changedFiles = await getChangedFiles();

const lintTasks = Object.entries(lintStagedConfig).map(async ([pattern, taskCreator]) => {
    const expandedPattern = `**/${pattern}`;
    const matchedFiles = micromatch(changedFiles, expandedPattern, {});
    const command = taskCreator(matchedFiles).trim();

    if (command === (globalThis as any).__lintStagedSkipMessage__) {
        consola.info(c.yellow(`no files matched, skip ${c.bold(c.magenta(taskCreator.name))}`));
        return;
    }

    const doubleQuoteIndex = command.indexOf('"');
    const [exe, ...args] = command.slice(0, doubleQuoteIndex).trim().split(/\s+/);
    const pathList = command
        .slice(doubleQuoteIndex)
        .split(/(?<=")\s+(?=")/)
        // 去除引号
        .map((pathWithQuote) => pathWithQuote.slice(1, -1));
    const filesTooMany = pathList.length > 10;
    const pathListStr = filesTooMany ? `<...${pathList.length}files>` : pathList.join(' ');
    const commandStr = `${[c.bold(exe), ...args, c.green(pathListStr)].join(' ')}`;
    console.log(c.magenta(`$ ${commandStr}\n`));
    const start = Date.now();
    try {
        await execaWithOutput(exe, [...args, ...pathList], { outputCommand: false });
    } catch (_error) {
        const error = _error as unknown as ExecaError;
        let { message, command, exitCode } = error;
        if (filesTooMany) {
            message = message.replace(command, c.red(commandStr));
        }
        consola.error(message);

        const fixCommand = `pnpm lint:fix ${baseBranch}`;
        const title = c.red('Lint 失败，请尝试在本地运行下面的修复命令！');
        logWithBox(title, c.green(fixCommand));

        consola.error(`Changed files:\n${pathList.map((path) => c.green(path)).join('\n')}`);
        process.exit(exitCode);
    }
    consola.success(`${taskCreator.name} ${formatDuration(Date.now() - start)}`);
});

// 只 lint 不修复，也就是只读不写不会有并发问题
await Promise.all(lintTasks);

consola.success('Lint 通过');
