#!/usr/bin/env bash
# Allocate a new private directory on the operator's backup volume.
set -eu
if [[ $# != 1 ]]; then
  echo 'Usage: bash scripts/create-recovery-dir.sh EXISTING_BACKUP_DIRECTORY' >&2
  exit 2
fi
parent=$(CDPATH= cd -- "$1" && pwd -P)
if probe=$(LC_ALL=C GIT_DISCOVERY_ACROSS_FILESYSTEM=1 git -C "$parent" rev-parse --git-dir 2>&1); then
  echo 'Choose a backup directory outside Git repositories.' >&2
  exit 1
elif [[ $probe != *'not a git repository'* ]]; then
  echo 'Unable to establish that the backup directory is outside Git repositories.' >&2
  exit 1
fi
umask 077
mktemp -d -- "$parent/epomail-backup.XXXXXXXX"
