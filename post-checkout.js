import { exec } from 'node:child_process';

async function runCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else if (stderr) {
                reject(new Error(stderr));
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

async function getCurrentBranchName() {
    return runCommand('git rev-parse --abbrev-ref HEAD');
}

const RESET = '\u001B[0m';
const YELLOW = '\u001B[33m';
function yellow(text) {
    return `${YELLOW}${text.replace(RESET, `${RESET}${YELLOW}`)}${RESET}`;
}

function green(str) {
    return `\u001B[32m${str}${RESET}`;
}

function link(title, url) {
    return `\u001B]8;;${url}\u001B\\${title}\u001B]8;;\u001B\\`;
}

async function checkBranch() {
    const currentBranchName = await getCurrentBranchName();
    const validBranchesRegexp = /^(feature|chore|bugfix|hotfix|beta|release)(\/[\w.#-]+)+$/;
    // v1.1.1-fat-a 格式的分支是 devops 自动创建的分支
    const ignoredBranchesRegexp = /(^master$)|(^v(\d+.){3})/;
    const isBranchNameValid =
        ignoredBranchesRegexp.test(currentBranchName) ||
        validBranchesRegexp.test(currentBranchName);

    if (!isBranchNameValid) {
        const branchNameStyleLink = link('分支命名规范', 'https://xxx.yyy.com');

        const renameBranchCommand = green('git branch -m <new/branch/name>');
        console.log(
            yellow(
                `当前分支名称不符合${branchNameStyleLink}，将无法推送到 github！请使用命令：${renameBranchCommand} 修改当前分支名称`,
            ),
        );
    }
}

const isCI = process.env.BUILD_ENV === 'CI' || !!process.env.CI;
if (!isCI) {
    checkBranch();
}
