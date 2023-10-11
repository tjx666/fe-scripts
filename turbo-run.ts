import ci from 'ci-info';
import type { ExecaError } from 'execa';
import c from 'picocolors';
import stripAnsi from 'strip-ansi';

import { consola, execaWithOutput, isESMain, logWithBox } from './utils';

export async function runTurboTask(scriptName: string, ...args: string[]) {
    try {
        await execaWithOutput('turbo', ['run', scriptName, ...args]);
    } catch (_error) {
        const error = _error as ExecaError;
        const match = (error.stdout ?? '')
            .trimEnd()
            .match(/\nFailed: {4}(?<packageName>[\w\-@/]+)#(?<scriptName>[\w:-]+)/);

        if (match?.groups) {
            const { packageName, scriptName } = match.groups;
            if (packageName && scriptName) {
                consola.error(
                    `执行包 ${c.yellow(packageName)} 的 ${c.yellow(scriptName)} 脚本失败！`,
                );

                const outputPrefix = `${packageName}:${scriptName}: `;
                const errorTaskOutput = error.stdout
                    .split(/\n/)
                    .filter((line) => stripAnsi(line).startsWith(outputPrefix))
                    .map((line) => line.slice(line.indexOf(' ') + 1))
                    .join('\n');
                console.log(
                    c.yellow('------------------------ 运行输出 -----------------------------\n'),
                );
                console.log(errorTaskOutput);
                console.log(
                    c.yellow(
                        '\n----------------------------------------------------------------------\n',
                    ),
                );

                const command = `pnpm --filter ${packageName} ${scriptName}`;
                logWithBox(c.red('可以在本地运行下面命令复现该错误'), c.green(command));

                if (ci.isCI) {
                    const prTittle = process.env.CHANGE_TITLE;
                    const skipCacheFlag = '[skip cache]';
                    if (prTittle && !prTittle.includes(skipCacheFlag)) {
                        console.log();
                        logWithBox(
                            c.red(
                                '若本地运行没有问题，可以尝试修改 pr 标题为下面这样以跳过 CI 缓存',
                            ),
                            c.green(`${prTittle} ${skipCacheFlag}`),
                        );
                    }
                }

                process.exit(1);
            }
        }

        throw error;
    }
}

if (isESMain(import.meta)) {
    const taskName = process.argv[2];
    await runTurboTask(taskName, ...process.argv.slice(3));
}
