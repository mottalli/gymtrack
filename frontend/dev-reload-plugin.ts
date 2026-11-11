import { randomUUID } from 'node:crypto'
import { renameSync, writeFileSync } from 'node:fs'
import type { Plugin } from 'vite'

// Used only by the development build watcher, never by release builds.
export function developmentReload(): Plugin {
  const enabled = process.env.GYMTRACK_DEV_WATCH === 'true'
  const revisionFile = process.env.GYMTRACK_DEV_REVISION_FILE
  let revision = ''
  return {
    name: 'gymtrack-compiled-development-reload',
    apply: 'build',
    buildStart() { revision = randomUUID() },
    transformIndexHtml: {
      order: 'post',
      handler() {
        if (!enabled) return []
        return [{
          tag: 'script',
          injectTo: 'body',
          children: `(() => {
            const initialRevision = ${JSON.stringify(revision)};
            let checking = false;
            setInterval(async () => {
              if (checking) return;
              checking = true;
              try {
                const response = await fetch('/__dev/revision', { cache: 'no-store' });
                if (response.ok && (await response.json()).revision !== initialRevision) location.reload();
              } catch { /* Ktor may be restarting; retry on the next tick. */ }
              finally { checking = false; }
            }, 1000);
          })();`,
        }]
      },
    },
    writeBundle() {
      if (!enabled || !revisionFile) return
      writeFileSync(`${revisionFile}.tmp`, revision)
      renameSync(`${revisionFile}.tmp`, revisionFile)
      process.send?.({ type: 'gymtrack:frontend-built' })
      console.log('[dev] Frontend compiled. Browser refresh is ready.')
    },
  }
}
