import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceTemplate, evaluateBetaEvidence, verifyLiveStaging } from '../scripts/public-beta-gate.mjs';

const sha = 'a'.repeat(40);
const artifactSha256 = 'b'.repeat(64);
const stagingVersionId = 'fixture-worker-version';
const stagingDeploymentId = 'fixture-worker-deployment';
const candidateIds = ['ci', 'artifact'];
const stagingIds = ['accounts', 'mailbox', 'privacy', 'scheduler', 'migration', 'recovery', 'performance'];
const fullOnly = ['inbound', 'outbound', 'webhook'];

function manifest(scope = 'mail-public-beta', oauthProviders = []) {
  const ids = [...candidateIds, ...stagingIds, ...(scope === 'internal-pilot' ? ['pilot-isolation'] : fullOnly),
    ...oauthProviders.map(provider => `oauth:${provider}`)];
  return {
    schemaVersion: 1, scope, sha, artifactSha256, stagingOrigin: 'https://staging.example.test',
    stagingVersionId, stagingDeploymentId, oauthProviders,
    gates: ids.map(id => ({
      id, status: 'PASS', sha, artifactSha256, environment: candidateIds.includes(id) ? 'candidate' : 'staging',
      versionId: stagingVersionId, deploymentId: stagingDeploymentId, owner: 'fixture-owner', reviewer: 'fixture-reviewer',
      reference: 'evidence/fixture.json', observedAt: '2026-11-13T00:00:00Z'
    }))
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

test('read-only live confirmation detects drift in the serving Worker and enabled providers', async () => {
  const evidence = manifest('mail-public-beta', ['github']);
  const requested = [];
  let version = stagingVersionId;
  let linuxdoSwitch = false;
  const fetch = async (url, options) => {
    assert.equal(options.redirect, 'error');
    requested.push(url.pathname);
    return Response.json(url.pathname === '/api/version'
      ? { sha, versionId: version }
      : { code: 200, data: { oauthLoginEnabled: 1, oauthProviders: { github: { enabled: 1 } }, linuxdoSwitch } });
  };
  await verifyLiveStaging(evidence, 'https://staging.example.test', fetch);
  assert.deepEqual(requested, ['/api/version', '/api/setting/websiteConfig', '/api/version']);
  await assert.rejects(verifyLiveStaging(evidence, 'https://other.example.test', fetch), /origin differs/);
  linuxdoSwitch = true;
  await assert.rejects(verifyLiveStaging(evidence, 'https://staging.example.test', fetch), /OAuth providers differ/);
  version = 'different-version';
  await assert.rejects(verifyLiveStaging(evidence, 'https://staging.example.test', fetch), /Version ID differs/);
});

test('a new template has all default gates and cannot be approved without real evidence', () => {
  const evidence = createEvidenceTemplate(sha, 'mail-public-beta');
  assert.ok(evidence.gates.every(row => row.status === 'NOT_RUN'));
  assert.equal(evidence.gates.length, candidateIds.length + stagingIds.length + fullOnly.length);
  assert.equal(evaluateBetaEvidence(evidence, { sha, scope: evidence.scope }).decision, 'BLOCK');
});
