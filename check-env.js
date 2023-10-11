/* eslint-disable unicorn/no-hex-escape, unicorn/escape-case */
import fs from 'node:fs/promises';
import path from 'node:path';

import ci from 'ci-info';

function green(str) {
    return `\x1b[32m${str}\x1b[0m`;
}

function yellow(str) {
    return `\x1b[33m${str}\x1b[0m`;
}

function error(message) {
    console.error('\x1b[41m' + ' ERROR ' + `\x1b[0m ${message}`);
}

function warn(message) {
    console.warn('\x1b[43m' + ' WARN ' + `\x1b[0m ${message}`);
}

const currentNodeVersion = process.version;
const nvmrcNodeVersion = (await fs.readFile(path.resolve(process.cwd(), '.nvmrc'), 'utf8')).trim();

const pmSpec = process.env.npm_config_user_agent.split(' ')[0];
const separatorPos = pmSpec.lastIndexOf('/');
const currentPmName = pmSpec.slice(0, Math.max(0, separatorPos));
const currentPmVersion = pmSpec.slice(separatorPos + 1);

const rootPkgJSON = JSON.parse(
    await fs.readFile(path.resolve(process.cwd(), 'package.json'), 'utf8'),
);
const corepackPnpmVersion = rootPkgJSON.packageManager.split('@')[1];

function exit(message) {
    error(message);
    warn(`当前环境：node ${currentNodeVersion}, ${currentPmName}@${currentPmVersion}`);
    warn(`要求环境: node ${nvmrcNodeVersion}, pnpm@${corepackPnpmVersion}`);
    warn('请认真阅读项目文档配置开发环境!');
    process.exit(1);
}

if (ci.isCI) {
    console.log(
        yellow(
            'CI 环境 pnpm 将使用 --frozen-lockfile 参数，用于检查 CI 环境生成的 lock file 是否和本地一致',
        ),
    );
    console.log(`参考：${green('https://pnpm.io/cli/install#--frozen-lockfile')}`);
}
if (currentNodeVersion !== nvmrcNodeVersion) {
    exit(
        `当前 node ${green(currentNodeVersion)} 和 .nvmrc 要求的版本 ${green(
            nvmrcNodeVersion,
        )} 不匹配，请将 nodejs 版本切换到 ${green(nvmrcNodeVersion)}！`,
    );
} else if (currentPmName !== 'pnpm') {
    exit(`当前正在使用 ${green(currentPmName)} 安装依赖，请切换到 ${green('pnpm')}`);
} else if (currentPmVersion !== corepackPnpmVersion) {
    exit(
        `当前 pnpm 的版本 ${green(currentPmVersion)} 和要求的版本 ${green(
            corepackPnpmVersion,
        )} 不匹配，请尝试运行 corepack enable 将 pnpm 版本切换到 ${green(corepackPnpmVersion)}`,
    );
}
