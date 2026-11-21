import assert from 'node:assert/strict';
import test from 'node:test';
import workflows from '../scripts/lib/release-workflows.cjs';

const { releaseKind, requireSuccessfulRun, requireIndependentApproval } = workflows;
const repo = { owner: 'owner', repo: 'mail' };
const sha = 'a'.repeat(40);
const branch = 'release/next';
const run = {
  event: 'workflow_dispatch', head_repository: { full_name: 'owner/mail' }, head_sha: sha,
  head_branch: branch, run_number: 20, run_attempt: 1, status: 'completed', conclusion: 'success', id: 120
};

function api(runs) {
  return {
    rest: { actions: { listWorkflowRuns: () => {} } },
    paginate: async (_method, params) => {
      assert.equal(params.head_sha, sha);
      assert.equal(params.workflow_id, 'public-beta-promotion.yml');
      assert.equal(params.event, 'workflow_dispatch');
      return runs;
    }
  };
}

const check = (runs, requiredBranch) => requireSuccessfulRun(
  api(runs), repo, 'public-beta-promotion.yml', sha, 'workflow_dispatch', requiredBranch
);

test('only source RC and freeze tags can publish without public mail acceptance', () => {
  for (const tag of ['v1.2.3-rc', 'v1.2.3-rc.1', 'v1.2.3-rc1', 'v1.2.1-freeze']) {
    assert.equal(releaseKind(tag), 'source-rc');
  }
  for (const tag of ['v1.2.3-beta', 'v1.2.3-beta.3', 'v1.2.3-rc.beta', 'v1.2.3-preview']) {
    assert.equal(releaseKind(tag), 'prerelease');
  }
  assert.equal(releaseKind('v2.0.0'), 'stable');
  assert.throws(() => releaseKind('v-release'), /Expected a version tag/);
});

test('promotion needs the exact repository, SHA, event and trusted branch', async () => {
  const mismatches = [
    { head_repository: { full_name: 'fork/mail' } }, { head_sha: 'b'.repeat(40) },
    { head_branch: 'fix/release' }, { event: 'pull_request' }
  ];
  const unrelated = mismatches.map(fields => ({ ...run, run_number: 22, ...fields }));
  await assert.rejects(check(unrelated), /successful latest/);
  assert.equal((await check([...unrelated, run])).id, run.id);
  await assert.rejects(check([run], 'master'), /successful latest/);
});

test('a newer failed, pending or canceled promotion supersedes previous approvals', async () => {
  for (const newer of [
    { run_attempt: 2, conclusion: 'failure' },
    { run_number: 21, status: 'in_progress', conclusion: null },
    { run_number: 21, conclusion: 'cancelled' }
  ]) {
    await assert.rejects(check([run, { ...run, ...newer }]), /successful latest/);
  }
  const latest = { ...run, run_number: 21, id: 121 };
  assert.equal((await check([latest, run], branch)).id, latest.id);
});

test('requires a human environment approval distinct from both dispatch and rerun operators', () => {
  const approved = { state: 'approved', environments: [{ name: 'public-beta-promotion' }], user: { login: 'QA', type: 'User' } };
  const verify = reviews => requireIndependentApproval(reviews, 'public-beta-promotion', ['Release', 'SRE']);
  for (const invalid of [
    [], [{ ...approved, state: 'rejected' }], [{ ...approved, environments: [{ name: 'staging' }] }],
    [{ ...approved, user: { login: 'release', type: 'User' } }], [{ ...approved, user: { login: 'sre', type: 'User' } }],
    [{ ...approved, user: { login: 'build-bot', type: 'Bot' } }]
  ]) assert.throws(() => verify(invalid), /independent human/);
  assert.equal(verify([approved]), 'QA');
});

const pushChecks = ['quality-gates.yml', 'security.yml', 'secret-scanning.yml'];
const quality = { ...run, event: 'push', id: 501, run_attempt: 2 };

function pushApi(overrides = {}) {
  const runs = Object.fromEntries(pushChecks.map((workflow, i) => [
    workflow, [{ ...quality, id: quality.id + i }]
  ]));
  return {
    rest: { actions: { listWorkflowRuns() {} } },
    paginate: async (_method, params) => {
      assert.deepEqual(params, { ...repo, workflow_id: params.workflow_id, event: 'push', head_sha: sha, branch, per_page: 100 });
      assert.ok(Object.hasOwn(runs, params.workflow_id));
      return overrides[params.workflow_id] ?? runs[params.workflow_id];
    }
  };
}

test('dispatch accepts only release branches that GitHub reports as protected', () => {
  const accept = workflows.requireProtectedReleaseBranch;
  for (const name of ['main', 'master', 'release/next']) {
    const ref = 'refs/heads/' + name;
    assert.equal(accept(ref, 'true'), name);
    for (const protection of ['false', undefined, '', 'unknown']) {
      assert.throws(() => accept(ref, protection), /GITHUB_REF_PROTECTED/);
    }
  }
  for (const ref of ['refs/tags/main', 'refs/heads/feature/test', undefined]) {
    assert.throws(() => accept(ref, 'true'), /protected/);
  }
});

test('public promotion requires all three matching push runs and returns only the Quality build', async () => {
  const promote = overrides => workflows.requirePromotionBuild(pushApi(overrides), repo, sha, branch);
  assert.deepEqual(await promote(), quality);
  await assert.rejects(workflows.requirePromotionBuild(pushApi(), repo, sha), /specific release branch/);
  for (const workflow of pushChecks) {
    for (const rows of [
      [], [{ ...quality, head_branch: 'master' }], [{ ...quality, head_sha: 'b'.repeat(40) }],
      [{ ...quality, head_repository: { full_name: 'fork/mail' } }], [{ ...quality, event: 'pull_request' }],
      ...['failure', 'cancelled', 'skipped', 'timed_out', null].map(conclusion => [
        quality, { ...quality, run_number: 21, status: conclusion ? 'completed' : 'in_progress', conclusion }
      ])
    ]) {
      await assert.rejects(promote({ [workflow]: rows }), error => error.message.includes(workflow));
    }
  }
});

test('final promotion rejects a replacement Quality build or rerun after environment approval', async () => {
  const approvedBuild = { id: String(quality.id), attempt: String(quality.run_attempt) };
  const recheck = overrides => workflows.requirePromotionBuild(pushApi(overrides), repo, sha, branch, approvedBuild);
  assert.deepEqual(await recheck(), quality);
  for (const newer of [{ id: quality.id + 20, run_number: 21 }, { run_attempt: 3 }]) {
    await assert.rejects(recheck({ 'quality-gates.yml': [quality, { ...quality, ...newer }] }), /run or attempt changed/);
  }
  await assert.rejects(recheck({ 'security.yml': [] }), /security\.yml/);
});

test('promotion downloads the pinned Quality artifact and rechecks CI after evidence validation before upload', async () => {
  const { readFile } = await import('node:fs/promises');
  const workflow = await readFile(new URL('../.github/workflows/public-beta-promotion.yml', import.meta.url), 'utf8');
  const steps = workflow.split(/^      - /m);
  const locate = steps.findIndex(step => step.includes('const result = await requirePromotionBuild('));
  const download = steps.findIndex(step => step.startsWith('uses: actions/download-artifact@'));
  const evidence = steps.findIndex(step => step.includes('node scripts/public-beta-gate.mjs'));
  const recheck = steps.findIndex(step => step.includes('await requirePromotionBuild(') && step.includes('process.env.QUALITY_ATTEMPT'));
  const upload = steps.findIndex(step => step.includes('uses: actions/upload-artifact@'));
  assert.ok(locate >= 0 && locate < download && download < evidence && evidence < recheck && recheck < upload);
  assert.match(steps[locate], /requireProtectedReleaseBranch\(context\.ref, process\.env\.GITHUB_REF_PROTECTED\)/);
  assert.match(steps[locate], /core\.setOutput\('run', String\(result\.id\)\)/);
  assert.match(steps[locate], /core\.setOutput\('attempt', String\(result\.run_attempt\)\)/);
  assert.match(steps[download], /name: epomail-candidate-\$\{\{ github\.sha \}\}/);
  assert.match(steps[download], /run-id: \$\{\{ needs\.candidate\.outputs\.quality-run \}\}/);
  assert.match(steps[recheck], /QUALITY_RUN: \$\{\{ needs\.candidate\.outputs\.quality-run \}\}/);
  assert.match(steps[recheck], /QUALITY_ATTEMPT: \$\{\{ needs\.candidate\.outputs\.quality-attempt \}\}/);
});

function tagChecksApi(extra = {}) {
  const rows = Object.fromEntries(pushChecks.map(workflow => [workflow, [quality]]));
  rows['public-beta-promotion.yml'] = [run];
  Object.assign(rows, extra);
  return {
    rest: { actions: { listWorkflowRuns() {} } },
    paginate: async (_method, params) => rows[params.workflow_id]
  };
}

test('source tags cannot combine successful push checks from different branches', async () => {
  assert.deepEqual(await workflows.requireTagReleaseChecks(tagChecksApi(), repo, sha, 'source-rc'), quality);
  const mixed = tagChecksApi({ 'secret-scanning.yml': [{ ...quality, head_branch: 'main' }] });
  await assert.rejects(workflows.requireTagReleaseChecks(mixed, repo, sha, 'source-rc'), /secret-scanning\.yml/);
});

test('tag publication rechecks the selected attempt and all push checks', async () => {
  for (const kind of ['source-rc', 'prerelease', 'stable']) {
    const selected = kind === 'source-rc' ? quality : run;
    const workflow = kind === 'source-rc' ? 'quality-gates.yml' : 'public-beta-promotion.yml';
    const expected = { id: String(selected.id), attempt: String(selected.run_attempt) };
    const recheck = extra => workflows.requireTagReleaseChecks(tagChecksApi(extra), repo, sha, kind, expected);
    assert.deepEqual(await recheck(), selected);
    for (const change of [{ run_attempt: selected.run_attempt + 1 }, { id: selected.id + 1, run_number: selected.run_number + 1 }]) {
      await assert.rejects(recheck({ [workflow]: [selected, { ...selected, ...change }] }), /run or attempt changed/);
    }
    await assert.rejects(recheck({ 'security.yml': [{ ...quality, conclusion: 'failure' }] }), /security\.yml/);
  }
});

test('remote tag must still resolve to the checked-out commit for lightweight and annotated tags', async () => {
  const name = 'v1.2.3';
  const commit = { type: 'commit', sha };
  const outer = { type: 'tag', sha: 'b'.repeat(40) };
  const inner = { type: 'tag', sha: 'c'.repeat(40) };
  const api = (initial, targets = {}) => ({ rest: { git: {
    async getRef(params) {
      assert.deepEqual(params, { ...repo, ref: 'tags/' + name });
      if (!initial) throw new Error('Tag not found');
      return { data: { object: initial } };
    },
    async getTag({ tag_sha }) {
      assert.ok(Object.hasOwn(targets, tag_sha));
      return { data: { object: targets[tag_sha] } };
    }
  } } });
  const check = (initial, targets) => workflows.requireTagCommit(api(initial, targets), repo, name, sha);
  await check(commit);
  await check(outer, { [outer.sha]: inner, [inner.sha]: commit });
  await assert.rejects(check(outer, { [outer.sha]: { ...commit, sha: 'd'.repeat(40) } }), /verified commit/);
  await assert.rejects(check({ ...commit, type: 'tree' }), /verified commit/);
  await assert.rejects(check(null), /Tag not found/);
});

test('tag workflow verifies the downloaded package before final run and ref checks, then publishes', async () => {
  const { readFile } = await import('node:fs/promises');
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const steps = workflow.split(/^      - /m);
  const resolve = steps.findIndex(step => step.includes('const run = await requireTagReleaseChecks('));
  const download = steps.findIndex(step => step.includes('uses: actions/download-artifact@'));
  const check = steps.findIndex(step => step.includes('tar -xOzf'));
  const ref = steps.findIndex(step => step.includes('await requireTagCommit('));
  const publish = steps.findIndex(step => step.includes('gh release create'));
  assert.ok(resolve >= 0 && resolve < download && download < check && check < ref && ref < publish);
  assert.match(steps[download], /run-id: \$\{\{ steps\.gates\.outputs\.run \}\}/);
  assert.match(steps[ref], /SELECTED_ATTEMPT: \$\{\{ steps\.gates\.outputs\.attempt \}\}/);
});
