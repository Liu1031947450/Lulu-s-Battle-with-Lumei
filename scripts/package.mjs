import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const release = path.join(root, 'release');
await mkdir(release, { recursive: true });
const temporary = await mkdtemp(path.join(tmpdir(), 'lulu-package-'));
const folder = path.join(temporary, 'Lulu-and-Lumei');
const archive = path.join(release, `Lulu-and-Lumei-v${version}.zip`);
const bundleHash = createHash('sha256').update(await readFile(path.join(root, 'index.html'))).digest('hex');
try {
  await mkdir(folder);
  const entries = ['index.html', 'src', 'assets', 'scripts', 'tests', 'package.json', 'package-lock.json', 'README.md', 'ASSETS.md', 'VALIDATION.md'];
  for (const entry of entries) await cp(path.join(root, entry), path.join(folder, entry), { recursive: true });
  await mkdir(path.join(folder, 'verification'));
  const evidence = (await readdir(path.join(root, 'artifacts'))).filter(name => /-report\.json$/.test(name) || /^(chromium|firefox|webkit)-(home|hit|solo-action|solo-result|duo-result|small-duo)\.png$/.test(name));
  for (const name of evidence) {
    if (name.endsWith('-report.json')) {
      const result = JSON.parse(await readFile(path.join(root, 'artifacts', name), 'utf8'));
      if (result.passed !== true) throw new Error(`${name} 未通过验收，停止打包`);
      if (result.bundleSHA256 && result.bundleSHA256 !== bundleHash) throw new Error(`${name} 对应旧版成品，请重新验收`);
    }
    await cp(path.join(root, 'artifacts', name), path.join(folder, 'verification', name));
  }
  await cp(path.join(root, 'artifacts/unit-tests.tap'), path.join(folder, 'verification/unit-tests.tap'));
  const checksums = [];
  async function hashDirectory(directory, prefix = '') {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((first, second) => first.name.localeCompare(second.name));
    for (const entry of entries) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await hashDirectory(path.join(directory, entry.name), `${relative}/`);
      else checksums.push(`${createHash('sha256').update(await readFile(path.join(directory, entry.name))).digest('hex')}  ${relative}`);
    }
  }
  await hashDirectory(folder);
  await writeFile(path.join(folder, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`);
  await rm(archive, { force: true });
  await execute('zip', ['-qr', archive, 'Lulu-and-Lumei'], { cwd: temporary });
  await execute('unzip', ['-t', archive]);
  const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
  await writeFile(`${archive}.sha256`, `${digest}  ${path.basename(archive)}\n`);
  console.log(`已打包 ${archive}`);
  console.log(`ZIP 完整性检查通过，包内校验清单覆盖 ${checksums.length} 个文件。`);
  console.log(`SHA-256 ${digest}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
