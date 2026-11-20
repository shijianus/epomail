#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { assertSafeBaseUrl } from './lib/oauth-staging.mjs';
import { validateBaseOrigin } from './check-privacy-readiness.mjs';

const REQUIRED = {
  ci: 'candidate',
  artifact: 'candidate',
  accounts: 'staging',
  mailbox: 'staging',
  privacy: 'staging',
  scheduler: 'staging',
  migration: 'staging',
  recovery: 'staging',
  performance: 'staging',
  inbound: 'staging',
  outbound: 'staging',
  webhook: 'staging'
};
const PILOT_EXCLUSIONS = new Set(['inbound', 'outbound', 'webhook']);
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const PROVIDERS = new Set(['google', 'github', 'apple', 'microsoft', 'linuxdo', 'custom']);

const present = value => typeof value === 'string' && value.trim() !== '';
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);

function requiredGates(scope) {
  const pilot = scope === 'internal-pilot';
  const gates = new Map(Object.entries(REQUIRED).filter(([id]) => !pilot || !PILOT_EXCLUSIONS.has(id)));
  if (pilot) gates.set('pilot-isolation', 'staging');
  return gates;
}

export function createEvidenceTemplate(sha, scope) {
  if (!['mail-public-beta', 'internal-pilot'].includes(scope)) throw new Error('Select a valid release scope');
  return {
    schemaVersion: 1, scope, sha, artifactSha256: '', stagingOrigin: '',
    stagingVersionId: '', stagingDeploymentId: '', oauthProviders: [],
    gates: Array.from(requiredGates(scope), ([id, environment]) => ({
      id, environment, sha, status: 'NOT_RUN', owner: '', reviewer: '',
      reference: '', observedAt: '', artifactSha256: '',
      ...(environment === 'staging' && { versionId: '', deploymentId: '' })
    }))
  };
}

export function evaluateBetaEvidence(evidence, { sha, scope }) {
  const blocking = [];
  const require = (condition, id, reason) => {
    if (!condition) blocking.push({ id, reason });
  };
  const pilot = scope === 'internal-pilot';
  const expected = requiredGates(scope);
  require(scope === 'mail-public-beta' || pilot, 'scope', 'Expected mail-public-beta or internal-pilot');
  require(SHA.test(sha ?? ''), 'candidate', 'Expected a full candidate Git SHA');
  if (!isRecord(evidence)) return { decision: 'BLOCK', blocking: [{ id: 'manifest', reason: 'Evidence manifest is missing or invalid' }] };

  require(evidence.schemaVersion === 1, 'manifest', 'Expected schemaVersion 1');
  require(evidence.scope === scope, 'scope', 'Evidence scope must equal requested scope');
  require(evidence.sha === sha, 'candidate', 'Evidence belongs to a different commit');
  require(DIGEST.test(evidence.artifactSha256 ?? ''), 'artifact', 'Missing SHA-256 of candidate artifact');
  require(present(evidence.stagingOrigin), 'staging', 'Missing accepted staging origin');
  require(present(evidence.stagingVersionId) && present(evidence.stagingDeploymentId), 'staging',
    'Missing active staging Version ID or Deployment ID');

  const providers = evidence.oauthProviders;
  require(Array.isArray(providers), 'scope', 'Declare enabled external OAuth providers, or an empty array');
  if (Array.isArray(providers)) {
    for (const provider of providers) {
      if (!PROVIDERS.has(provider) || expected.has(`oauth:${provider}`)) {
        blocking.push({ id: 'scope', reason: 'Unrecognized or duplicate external OAuth provider' });
      } else {
        expected.set(`oauth:${provider}`, 'staging');
      }
    }
  }

  const rows = new Map();
  if (Array.isArray(evidence.gates)) {
    for (const row of evidence.gates) {
      if (!isRecord(row) || !expected.has(row.id) || rows.has(row.id)) {
        blocking.push({ id: 'manifest', reason: 'Unexpected, invalid or duplicate gate record' });
      } else {
        rows.set(row.id, row);
      }
    }
  }

  for (const [id, environment] of expected) {
    const row = rows.get(id);
    if (!row || row.status !== 'PASS') {
      blocking.push({ id, reason: 'PASS evidence is required' });
      continue;
    }
    require(row.sha === sha && row.environment === environment, id, 'Evidence has a different SHA or environment');
    require(present(row.owner) && present(row.reviewer) && present(row.reference)
      && present(row.observedAt) && Number.isFinite(Date.parse(row.observedAt)), id,
    'Include the owner, reviewer, evidence reference and verification time');
    if (environment === 'staging') {
      require(present(evidence.stagingVersionId) && row.versionId === evidence.stagingVersionId, id,
        'Evidence does not match the active staging Worker version');
      require(present(evidence.stagingDeploymentId) && row.deploymentId === evidence.stagingDeploymentId, id,
        'Evidence does not match the active staging deployment');
    }
    if (id !== 'ci') {
      require(DIGEST.test(row.artifactSha256 ?? '') && row.artifactSha256 === evidence.artifactSha256, id,
        'Evidence does not identify the candidate artifact');
    }
  }
  return { decision: blocking.length ? 'BLOCK' : pilot ? 'GO_INTERNAL_PILOT' : 'GO_PUBLIC_BETA', blocking };
}

async function sha256File(filename) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filename)) digest.update(chunk);
  return digest.digest('hex');
}

export async function verifyLiveStaging(evidence, rawOrigin, fetchImpl = fetch, access = {}) {
  const origin = assertSafeBaseUrl(validateBaseOrigin(rawOrigin));
  if (origin !== evidence.stagingOrigin) throw new Error('Staging origin differs from the evidence');
  const headers = { Accept: 'application/json' };
  if (access.clientId || access.clientSecret) {
    if (!access.clientId || !access.clientSecret || access.trustedOrigin !== origin) {
      throw new Error('Staging Access credentials require a complete pair and an exactly matching trusted origin');
    }
    headers['CF-Access-Client-Id'] = access.clientId;
    headers['CF-Access-Client-Secret'] = access.clientSecret;
  }
  async function get(path) {
    const response = await fetchImpl(new URL(path, origin), {
      headers, redirect: 'error', signal: AbortSignal.timeout(8000)
    });
    if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) {
      throw new Error('Staging response did not match the expected JSON contract');
    }
    return response.json();
  }

  async function verifyVersion() {
    const version = await get('/api/version');
    if (version?.sha !== evidence.sha || version.versionId !== evidence.stagingVersionId) {
      throw new Error('Serving Staging SHA or Worker Version ID differs from the evidence');
    }
  }

  await verifyVersion();
  const config = await get('/api/setting/websiteConfig');
  const settings = config?.data;
  if (config?.code !== 200 || !isRecord(settings?.oauthProviders)
    || ![0, 1].includes(settings.oauthLoginEnabled)) {
    throw new Error('Staging public OAuth configuration is unavailable');
  }
  const enabled = new Set();
  if (settings.oauthLoginEnabled === 1) {
    for (const [provider, value] of Object.entries(settings.oauthProviders)) {
      if (value?.enabled === 1 || value?.enabled === true) enabled.add(provider);
    }
  }
  if (settings.linuxdoSwitch === true) enabled.add('linuxdo');
  if (enabled.size !== evidence.oauthProviders.length
    || evidence.oauthProviders.some(provider => !enabled.has(provider))) {
    throw new Error('Enabled Staging OAuth providers differ from the accepted release scope');
  }
  await verifyVersion();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { values } = parseArgs({
      options: {
        evidence: { type: 'string' }, scope: { type: 'string' }, template: { type: 'boolean' },
        artifact: { type: 'string' }, 'staging-origin': { type: 'string' }
      }
    });
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (values.template) {
      console.log(JSON.stringify(createEvidenceTemplate(sha, values.scope), null, 2));
      process.exit(0);
    }
    if (!values.evidence || !values.artifact || !values['staging-origin']) {
      throw new Error('Usage: node scripts/public-beta-gate.mjs --evidence <manifest.json> --artifact <archive> --staging-origin <https-origin> --scope <mail-public-beta|internal-pilot>');
    }
    if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) {
      throw new Error('Evaluate evidence in a clean checkout of the candidate');
    }
    const evidence = JSON.parse(readFileSync(values.evidence, 'utf8'));
    const result = evaluateBetaEvidence(evidence, { sha, scope: values.scope });
    if (result.decision !== 'BLOCK') {
      if (await sha256File(values.artifact) !== evidence.artifactSha256) {
        result.blocking.push({ id: 'artifact', reason: 'Archive checksum differs from accepted candidate' });
      }
      try {
        await verifyLiveStaging(evidence, values['staging-origin'], fetch, {
          trustedOrigin: process.env.EPOMAIL_TRUSTED_STAGING_ORIGIN,
          clientId: process.env.CF_ACCESS_CLIENT_ID,
          clientSecret: process.env.CF_ACCESS_CLIENT_SECRET
        });
      } catch (error) {
        result.blocking.push({ id: 'staging', reason: error.message });
      }
      if (result.blocking.length) result.decision = 'BLOCK';
    }
    console.log(JSON.stringify({ sha, scope: values.scope, ...result }, null, 2));
    if (result.decision === 'BLOCK') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof SyntaxError ? 'Invalid evidence JSON' : error.message);
    process.exitCode = 2;
  }
}
