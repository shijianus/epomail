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
