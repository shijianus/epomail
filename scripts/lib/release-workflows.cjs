'use strict';

function isReleaseBranch(branch) {
  return branch === 'main' || branch === 'master' || Boolean(branch?.startsWith('release/'));
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

function requireIndependentApproval(reviews, environment, actors) {
  const requesters = new Set(actors.filter(Boolean).map(actor => actor.toLowerCase()));
  const approval = reviews.find(review => review.state === 'approved' &&
    review.environments?.some(target => target.name === environment) &&
    review.user?.type === 'User' && review.user.login && !requesters.has(review.user.login.toLowerCase()));
  if (!approval) throw new Error('An independent human reviewer must approve this workflow run in its protected environment');
  return approval.user.login;
}

module.exports = { isReleaseBranch, releaseKind, requireSuccessfulRun, requireIndependentApproval };
