const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const tempIndex = path.join(rootDir, '.git', 'temp_index');

console.log('Ensuring dist is freshly built...');
execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

// Ensure .nojekyll exists in dist
fs.writeFileSync(path.join(distDir, '.nojekyll'), '');

console.log('Building Git tree from dist directory...');
const env = { ...process.env, GIT_WORK_TREE: distDir, GIT_INDEX_FILE: tempIndex };

execSync('git --work-tree=dist add -A', { cwd: rootDir, env, stdio: 'inherit' });
const tree = execSync('git write-tree', { cwd: rootDir, env }).toString().trim();
console.log('Generated Tree SHA:', tree);

if (fs.existsSync(tempIndex)) {
  fs.unlinkSync(tempIndex);
}

// Get parent commit on gh-pages if exists
let parentCommit = '';
try {
  parentCommit = execSync('git rev-parse gh-pages', { cwd: rootDir }).toString().trim();
  console.log('Current gh-pages parent commit:', parentCommit);
} catch (e) {
  console.log('No existing gh-pages commit found.');
}

const commitMsg = 'Deploy Ground Floor updates: white chairs, blue room signs, brown doors, pink corridor walls, white lab walls, floor tiles, floating damage numbers, and critical headshots';
const parentArg = parentCommit ? `-p ${parentCommit}` : '';
const commitCmd = `git commit-tree ${tree} ${parentArg} -m "${commitMsg}"`;
const commitSha = execSync(commitCmd, { cwd: rootDir }).toString().trim();
console.log('Created commit on gh-pages:', commitSha);

execSync(`git update-ref refs/heads/gh-pages ${commitSha}`, { cwd: rootDir, stdio: 'inherit' });
console.log('Updated refs/heads/gh-pages to', commitSha);

console.log('Pushing gh-pages to origin...');
execSync('git push origin gh-pages', { cwd: rootDir, stdio: 'inherit' });
console.log('Successfully deployed to GitHub Pages!');
