import c from 'picocolors';
import prompts from 'prompts';

import { checkExecOutput, consola, getExecOutput, runCommand } from './utils';

const currentBranch = (await getExecOutput('git', ['branch', '--show-current'])).trim();
const localBranches = (await getExecOutput('git', ['branch']))
    .split(/\n/)
    .map((branch) => {
        if (branch.startsWith('* ')) {
            branch = branch.slice(2);
        }
        return branch.trim();
    })
    .filter((branch) => branch !== currentBranch);

let baseBranch: string = process.argv[2];
if (baseBranch === undefined) {
    const input = await prompts({
        name: 'value',
        type: 'autocomplete',
        message: '你要合并到哪个分支？',
        choices: localBranches.map((branch) => ({
            title: branch,
            value: branch,
        })),
        initial: 'master',
    });
    baseBranch = input.value;
}

consola.warn(`更新本地 ${c.green(baseBranch)} 分支为远程最新代码...`);
await runCommand(`git fetch -u origin ${baseBranch}:${baseBranch}`);

await runCommand(`lint-staged --no-stash --allow-empty --diff ${baseBranch}...HEAD -p false`, {
    env: {
        LINT_FIX: '1',
    },
});

const hasStagedFiles = await checkExecOutput('git diff --name-only --cached');
// staged 区有文件就视为有文件被自动修复
console.log();
if (hasStagedFiles) {
    consola.warn('请提交被自动修复的文件！');
} else {
    consola.success('本地没有 lint 错误！');
}
