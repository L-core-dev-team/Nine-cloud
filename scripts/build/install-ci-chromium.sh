#!/usr/bin/env bash
# GitHub's disposable Ubuntu runner only. Never relax APT signatures or TLS.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "$(uname -s)" == Linux ]] || { echo 'GitHub Linux runner required'; exit 2; }
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { echo 'Reviewed Ubuntu 24.04 runner required'; exit 2; }
mkdir -p test-results/ci-install
exec > >(tee test-results/ci-install/chromium-install.log) 2>&1

# Two observed runs failed resolving Azure's mirror. Change only that known
# mirror to Ubuntu's primary HTTPS archive; suites, components and Signed-By stay intact.
sudo python3 - <<'PY'
from pathlib import Path
import re
paths = [Path('/etc/apt/sources.list'), *Path('/etc/apt/sources.list.d').glob('*.sources'), *Path('/etc/apt/sources.list.d').glob('*.list')]
for path in paths:
    if not path.is_file():
        continue
    old = path.read_text()
    new = re.sub(r'https?://azure\.archive\.ubuntu\.com/ubuntu(?=[/\s]|$)', 'https://archive.ubuntu.com/ubuntu', old)
    # Current hosted images can use mirror+file rather than a literal URI.
    new = new.replace('mirror+file:/etc/apt/apt-mirrors.txt', 'https://archive.ubuntu.com/ubuntu')
    new = new.replace('mirror+file:/etc/apt/apt-mirrors-security.txt', 'https://security.ubuntu.com/ubuntu')
    if new != old:
        path.write_text(new)
        print('Selected official Ubuntu archive in', path.name)
PY

bounded_install() {
  local stage="$1"; shift
  local attempt code
  for attempt in 1 2; do
    echo "stage=$stage attempt=$attempt (240 second bound)"
    if [[ "$stage" == os-dependencies ]]; then
      # Root must own the timeout group too, so a timed-out apt child cannot retain dpkg locks.
      if sudo env "PATH=$PATH" timeout --kill-after=10s 240s "$@"; then return 0; else code=$?; fi
    else
      if timeout --kill-after=10s 240s "$@"; then return 0; else code=$?; fi
    fi
    echo "stage=$stage attempt=$attempt exit=$code"
    [[ "$attempt" == 2 ]] || sleep 5
  done
  return "$code"
}
bounded_install os-dependencies "$(command -v node)" "$PWD/node_modules/playwright/cli.js" install-deps chromium
bounded_install chromium "$(command -v node)" "$PWD/node_modules/playwright/cli.js" install chromium
echo 'Chromium installation completed; browser tests must still pass.'
