'use strict';

function isReleaseBranch(branch) {
  return branch === 'main' || branch === 'master' || Boolean(branch?.startsWith('release/'));
}

function requireProtectedReleaseBranch(ref, protection) {
  const prefix = 'refs/heads/';
  const branch = typeof ref === 'string' && ref.startsWith(prefix) ? ref.slice(prefix.length) : '';
  if (!isReleaseBranch(branch) || protection !== 'true') {
    throw new Error('Dispatch from a protected master, main or release/* branch. GitHub must report GITHUB_REF_PROTECTED=true for this run.');
  }
  return branch;
}

function gitleaksPushRange(branch, before, after) {
  if (!/^[0-9a-f]{40}$/.test(after)) throw new Error('Invalid pushed commit');
  if (!before || /^0{40}$/.test(before) || isReleaseBranch(branch)) return '--all';
  if (!/^[0-9a-f]{40}$/.test(before)) throw new Error('Invalid previous commit');
  return `${before}..${after}`;
}

function releaseKind(tag) {
  const match = /^v\d+\.\d+\.\d+(?:-([0-9A-Za-z.-]+))?$/.exec(tag);
  if (!match) throw new Error('Expected a version tag such as v1.2.3, v1.2.3-beta.1 or v1.2.3-rc.1');
  if (!match[1]) return 'stable';
  if (/^(?:rc(?:[.-]?\d+)?|freeze)$/.test(match[1])) return 'source-rc';
  return 'prerelease';
}

async function requireSuccessfulRun(github, repo, workflow, sha, event, branch) {
  const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
    ...repo, workflow_id: workflow, head_sha: sha, event, ...(branch && { branch }), per_page: 100
  });
  const eligible = runs.filter(run => run.head_sha === sha && run.event === event &&
    isReleaseBranch(run.head_branch) && (!branch || run.head_branch === branch) &&
    run.head_repository?.full_name?.toLowerCase() === `${repo.owner}/${repo.repo}`.toLowerCase());
  eligible.sort((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt);
  const current = eligible[0];
  if (current?.status !== 'completed' || current.conclusion !== 'success') {
    throw new Error(`${workflow} needs a successful latest ${event} run for ${sha} on an eligible release branch`);
  }
  return current;
}

async function requirePromotionBuild(github, repo, sha, branch, expectedQuality) {
  if (!isReleaseBranch(branch)) throw new Error('Promotion requires a specific release branch');
  const checks = ['quality-gates.yml', 'security.yml', 'secret-scanning.yml'];
  const [quality] = await Promise.all(checks.map(workflow =>
    requireSuccessfulRun(github, repo, workflow, sha, 'push', branch)
  ));
  if (expectedQuality && (String(quality.id) !== expectedQuality.id ||
    String(quality.run_attempt) !== expectedQuality.attempt)) {
    throw new Error('The reviewed Quality Gates run or attempt changed. Start a new promotion for the current build.');
  }
  return quality;
}

function requireIndependentApproval(reviews, environment, actors) {
  const requesters = new Set(actors.filter(Boolean).map(actor => actor.toLowerCase()));
  const approval = reviews.find(review => review.state === 'approved' &&
    review.environments?.some(target => target.name === environment) &&
    review.user?.type === 'User' && review.user.login && !requesters.has(review.user.login.toLowerCase()));
  if (!approval) throw new Error('An independent human reviewer must approve this workflow run in its protected environment');
  return approval.user.login;
}

async function requireTagReleaseChecks(github, repo, sha, kind, expected) {
  const sourceOnly = kind === 'source-rc';
  const workflow = sourceOnly ? 'quality-gates.yml' : 'public-beta-promotion.yml';
  const event = sourceOnly ? 'push' : 'workflow_dispatch';
  const selected = await requireSuccessfulRun(github, repo, workflow, sha, event);
  const pin = { id: String(selected.id), attempt: String(selected.run_attempt) };
  if (expected && (pin.id !== expected.id || pin.attempt !== expected.attempt)) {
    throw new Error(`${workflow} run or attempt changed during tag publication`);
  }
  await requirePromotionBuild(github, repo, sha, selected.head_branch, sourceOnly ? pin : undefined);
  return selected;
}

async function requireTagCommit(github, repo, tag, sha) {
  const { data: ref } = await github.rest.git.getRef({ ...repo, ref: `tags/${tag}` });
  let target = ref.object;
  while (target.type === 'tag') {
    const { data } = await github.rest.git.getTag({ ...repo, tag_sha: target.sha });
    target = data.object;
  }
  if (target.type !== 'commit' || target.sha !== sha) {
    throw new Error(`The remote tag ${tag} no longer points to the verified commit ${sha}`);
  }
}

module.exports = {
  isReleaseBranch, requireProtectedReleaseBranch, gitleaksPushRange, releaseKind, requireSuccessfulRun,
  requirePromotionBuild, requireIndependentApproval, requireTagReleaseChecks, requireTagCommit
};
