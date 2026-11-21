import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceTemplate, evaluateBetaEvidence, verifyLiveStaging } from '../scripts/public-beta-gate.mjs';

const sha = 'a'.repeat(40);
const artifactSha256 = 'b'.repeat(64);
const stagingVersionId = 'fixture-worker-version';
const stagingDeploymentId = 'fixture-worker-deployment';
const controlAccess = { accountId: '1'.repeat(32), deploymentsToken: 'fixture-deployment-reader' };
const deployment = {
  id: stagingDeploymentId, created_on: '2026-11-12T23:59:59Z',
  versions: [{ version_id: stagingVersionId, percentage: 100 }]
};
const candidateIds = ['ci', 'artifact'];
const stagingIds = ['accounts', 'mailbox', 'privacy', 'scheduler', 'migration', 'recovery', 'performance'];
const fullOnly = ['inbound', 'outbound', 'webhook', 'credential-retirement'];

function manifest(scope = 'mail-public-beta', oauthProviders = []) {
  const ids = [...candidateIds, ...stagingIds, ...(scope === 'internal-pilot' ? ['pilot-isolation'] : fullOnly),
    ...oauthProviders.map(provider => `oauth:${provider}`)];
  return {
    schemaVersion: 1, scope, sha, artifactSha256, stagingOrigin: 'https://staging.example.test',
    stagingVersionId, stagingDeploymentId, oauthProviders,
    gates: ids.map(id => ({
      id, status: 'PASS', sha, artifactSha256, environment: candidateIds.includes(id) || id === 'credential-retirement' ? 'candidate' : 'staging',
      versionId: stagingVersionId, deploymentId: stagingDeploymentId, owner: 'fixture-owner', reviewer: 'fixture-reviewer',
      reference: 'evidence/fixture.json', observedAt: '2026-11-13T00:00:00Z',
      ...(id === 'credential-retirement' && {
        restrictedReportSha256: 'c'.repeat(64), unresolvedFindings: 0,
        disposition: { mailProvider: 'retired', jwtSigning: 'retired', totp: 'verified-never-used',
          testCredentials: 'verified-test-only', priorSessions: 'revoked' }
      })
    }))
  };
}

function routeRequests(staging, control = () => ({ success: true, result: { deployments: [deployment] } })) {
  return async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    if (url.origin === 'https://api.cloudflare.com') {
      assert.equal(url.pathname, `/client/v4/accounts/${controlAccess.accountId}/workers/scripts/epomail-staging/deployments`);
      assert.deepEqual(options.headers, {
        Accept: 'application/json', Authorization: `Bearer ${controlAccess.deploymentsToken}`
      });
      return Response.json(control());
    }
    assert.equal(url.origin, 'https://staging.example.test');
    assert.equal(options.headers.Authorization, undefined);
    return staging(url, options);
  };
}

test('mail public beta requires every applicable gate, including each enabled IdP', () => {
  const evidence = manifest('mail-public-beta', ['google', 'github']);
  const options = { sha, scope: evidence.scope };
  assert.equal(evaluateBetaEvidence(evidence, options).decision, 'GO_PUBLIC_BETA');
  evidence.gates = evidence.gates.filter(row => !['webhook', 'oauth:github'].includes(row.id));
  const result = evaluateBetaEvidence(evidence, options);
  assert.equal(result.decision, 'BLOCK');
  assert.deepEqual(result.blocking.map(row => row.id), ['webhook', 'oauth:github']);
});

test('old public evidence, unreviewed credentials and outstanding sessions block public admission', () => {
  for (const change of [
    (e, row) => { e.gates = e.gates.filter(g => g !== row); },
    (e, row) => { row.reviewer = ' @FIXTURE-OWNER '; },
    (e, row) => { row.reviewer = '@'; },
    (e, row) => { row.restrictedReportSha256 = ''; },
    (e, row) => { row.unresolvedFindings = 1; },
    (e, row) => { row.disposition.mailProvider = 'verified-never-used'; },
    (e, row) => { delete row.disposition.totp; },
    (e, row) => { row.disposition.priorSessions = 'pending'; }
  ]) {
    const evidence = manifest();
    change(evidence, evidence.gates.find(g => g.id === 'credential-retirement'));
    const result = evaluateBetaEvidence(evidence, { sha, scope: 'mail-public-beta' });
    assert.equal(result.decision, 'BLOCK');
    assert.deepEqual([...new Set(result.blocking.map(issue => issue.id))], ['credential-retirement']);
  }
  const template = createEvidenceTemplate(sha, 'mail-public-beta');
  assert.equal(template.gates.find(g => g.id === 'credential-retirement').status, 'NOT_RUN');
  assert.equal(createEvidenceTemplate(sha, 'internal-pilot').gates.some(g => g.id === 'credential-retirement'), false);
});

test('rejects stale deployment, duplicate evidence, skipped gates and different artifact digests', () => {
  const evidence = manifest();
  evidence.gates.find(row => row.id === 'mailbox').versionId = 'prior-version';
  evidence.gates.find(row => row.id === 'migration').deploymentId = 'prior-deployment';
  evidence.gates.find(row => row.id === 'recovery').status = 'SKIPPED';
  evidence.gates.find(row => row.id === 'performance').artifactSha256 = 'c'.repeat(64);
  evidence.gates.push(evidence.gates[0]);
  const result = evaluateBetaEvidence(evidence, { sha, scope: evidence.scope });
  assert.equal(result.decision, 'BLOCK');
  assert.deepEqual(result.blocking.map(row => row.id), ['manifest', 'mailbox', 'migration', 'recovery', 'performance']);
});

test('pilot evidence cannot be reused for public beta and requires runtime isolation', () => {
  const evidence = manifest('internal-pilot');
  assert.equal(evaluateBetaEvidence(evidence, { sha, scope: 'internal-pilot' }).decision, 'GO_INTERNAL_PILOT');
  assert.equal(evaluateBetaEvidence(evidence, { sha, scope: 'mail-public-beta' }).decision, 'BLOCK');
  evidence.gates.pop();
  assert.equal(evaluateBetaEvidence(evidence, { sha, scope: 'internal-pilot' }).decision, 'BLOCK');
});

test('a future or invalid observation cannot attest a completed gate', () => {
  const evidence = manifest();
  evidence.gates.find(row => row.id === 'ci').observedAt = '2999-01-01T00:00:00Z';
  evidence.gates.find(row => row.id === 'privacy').observedAt = 'invalid';
  const result = evaluateBetaEvidence(evidence, { sha, scope: evidence.scope });
  assert.equal(result.decision, 'BLOCK');
  assert.deepEqual(result.blocking.map(row => row.id), ['ci', 'privacy']);
});

test('read-only live confirmation detects drift in the serving Worker and enabled providers', async () => {
  const evidence = manifest('mail-public-beta', ['github']);
  const requested = [];
  let version = stagingVersionId;
  let linuxdoSwitch = false;
  const fetch = routeRequests(async url => {
    requested.push(url.pathname);
    return Response.json(url.pathname === '/api/version'
      ? { sha, versionId: version }
      : { code: 200, data: { oauthLoginEnabled: 1, oauthProviders: { github: { enabled: 1 } }, linuxdoSwitch } });
  });
  await verifyLiveStaging(evidence, 'https://staging.example.test', fetch, controlAccess);
  assert.deepEqual(requested, ['/api/version', '/api/setting/websiteConfig', '/api/version']);
  await assert.rejects(verifyLiveStaging(evidence, 'https://other.example.test', fetch, controlAccess), /origin differs/);
  linuxdoSwitch = true;
  await assert.rejects(verifyLiveStaging(evidence, 'https://staging.example.test', fetch, controlAccess), /OAuth providers differ/);
  version = 'different-version';
  await assert.rejects(verifyLiveStaging(evidence, 'https://staging.example.test', fetch, controlAccess), /Version ID differs/);
});

test('a new template has all default gates and cannot be approved without real evidence', () => {
  const evidence = createEvidenceTemplate(sha, 'mail-public-beta');
  assert.ok(evidence.gates.every(row => row.status === 'NOT_RUN'));
  assert.equal(evidence.gates.length, candidateIds.length + stagingIds.length + fullOnly.length);
  assert.equal(evaluateBetaEvidence(evidence, { sha, scope: evidence.scope }).decision, 'BLOCK');
});

test('Access service tokens are scoped to the independently configured staging origin', async () => {
  const evidence = manifest();
  const origin = evidence.stagingOrigin;
  const access = { ...controlAccess, clientId: 'fixture-id', clientSecret: 'fixture-value', trustedOrigin: origin };
  let calls = 0;
  const request = routeRequests(async (url, options) => {
    calls++;
    assert.equal(url.origin, origin);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['CF-Access-Client-Id'], access.clientId);
    assert.equal(options.headers['CF-Access-Client-Secret'], access.clientSecret);
    return Response.json(url.pathname === '/api/version' ? { sha, versionId: stagingVersionId }
      : { code: 200, data: { oauthLoginEnabled: 0, oauthProviders: {}, linuxdoSwitch: false } });
  });
  await assert.rejects(verifyLiveStaging(evidence, origin, request, { ...access, trustedOrigin: '' }), /trusted origin/);
  assert.equal(calls, 0);
  await verifyLiveStaging(evidence, origin, request, access);
  assert.equal(calls, 3);
});

test('verifies the current deployment before and after reading Staging, even when the Worker version is reused', async () => {
  const evidence = manifest();
  const order = [];
  const redeployment = { ...deployment, id: 'new-deployment' };
  const request = routeRequests(url => {
    order.push(url.pathname);
    return Response.json(url.pathname === '/api/version' ? { sha, versionId: stagingVersionId }
      : { code: 200, data: { oauthLoginEnabled: 0, oauthProviders: {}, linuxdoSwitch: false } });
  }, () => {
    const first = order.length === 0;
    order.push('control');
    return { success: true, result: { deployments: first ? [deployment] : [redeployment, deployment] } };
  });
  await assert.rejects(verifyLiveStaging(evidence, evidence.stagingOrigin, request, controlAccess), /Deployment ID differs/);
  assert.deepEqual(order, ['control', '/api/version', '/api/setting/websiteConfig', '/api/version', 'control']);
});

test('partial traffic, missing receipts and observations from before rollout block promotion', async () => {
  const evidence = manifest();
  const split = { ...deployment, versions: [
    { version_id: stagingVersionId, percentage: 95 }, { version_id: 'older-version', percentage: 5 }
  ] };
  for (const [result, error] of [
    [{ deployments: [] }, /Deployment ID/],
    [{ deployments: [split] }, /100%/],
    [{ deployments: [{ ...deployment, created_on: '2026-11-14T00:00:00Z' }] }, /on or after/]
  ]) {
    const request = routeRequests(assert.fail, () => ({ success: true, result }));
    await assert.rejects(verifyLiveStaging(evidence, evidence.stagingOrigin, request, controlAccess), error);
  }
});

test('invalid control-plane credentials block before network access and transport errors are redacted', async () => {
  const evidence = manifest();
  let calls = 0;
  const request = async () => { calls++; throw new Error(controlAccess.deploymentsToken); };
  for (const access of [{}, { ...controlAccess, accountId: 'invalid/account' }]) {
    await assert.rejects(verifyLiveStaging(evidence, evidence.stagingOrigin, request, access), /account ID/);
  }
  assert.equal(calls, 0);
  await assert.rejects(verifyLiveStaging(evidence, evidence.stagingOrigin, request, controlAccess),
    { message: 'Cloudflare Staging deployment lookup failed' });
  assert.equal(calls, 1);
});

test('release scope follows the global OAuth switch and rejects ambiguous public provider flags', async () => {
  const evidence = manifest();
  const settings = { oauthLoginEnabled: 0, oauthProviders: {}, linuxdoSwitch: true };
  const request = routeRequests(url => Response.json(url.pathname === '/api/version' ? { sha, versionId: stagingVersionId }
    : { code: 200, data: settings }));
  const check = () => verifyLiveStaging(evidence, evidence.stagingOrigin, request, controlAccess);
  await check(); // All OAuth routes, including legacy LinuxDo, first enforce the global switch.
  settings.oauthProviders = { github: { enabled: true } };
  await assert.rejects(check(), /disagree/);
  settings.oauthLoginEnabled = 1;
  settings.linuxdoSwitch = false;
  settings.oauthProviders = { linuxdo: { enabled: 1 } };
  await assert.rejects(check(), /disagree/);
  for (const provider of [null, [], {}, { enabled: '1' }]) {
    settings.oauthProviders = { github: provider };
    await assert.rejects(check(), /invalid enabled flag/);
  }
  settings.oauthProviders = { github: { enabled: false } };
  await check();
  for (const flag of [undefined, 'true', 0]) {
    settings.linuxdoSwitch = flag;
    await assert.rejects(check(), /configuration is unavailable/);
  }
});
