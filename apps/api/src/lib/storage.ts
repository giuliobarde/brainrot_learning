import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config';

export interface StoredObject {
  storagePath: string;
  bytes: number;
}

export interface StorageDriver {
  put(userId: string, originalFilename: string, contents: Buffer): Promise<StoredObject>;
  remove(storagePath: string): Promise<void>;
}

function safeFilename(name: string): string {
  return name
    .replace(/[/\\\0]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
}

export function createLocalStorage(rootDir?: string): StorageDriver {
  const resolveRoot = () => rootDir ?? process.env.STORAGE_ROOT ?? config.storageRoot;
  return {
    async put(userId, originalFilename, contents) {
      const userDir = path.join(resolveRoot(), userId);
      await mkdir(userDir, { recursive: true });
      const ext = path.extname(originalFilename);
      const fname = `${randomUUID()}${ext}`;
      const fullPath = path.join(userDir, fname);
      await writeFile(fullPath, contents);
      const info = await stat(fullPath);
      return { storagePath: fullPath, bytes: info.size };
    },
    async remove(storagePath) {
      try {
        await unlink(storagePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    },
  };
}

export const _internal = { safeFilename };
