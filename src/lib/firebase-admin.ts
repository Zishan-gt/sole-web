import fs from 'fs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const configUrl = new URL('../../firebase-applet-config.json', import.meta.url);
let fileConfig: { projectId?: string; firestoreDatabaseId?: string } = {};
if (fs.existsSync(configUrl)) {
  fileConfig = JSON.parse(fs.readFileSync(configUrl, 'utf8')) as {
    projectId?: string;
    firestoreDatabaseId?: string;
  };
}

const projectId =
  fileConfig.projectId ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT;
const firestoreDatabaseId =
  fileConfig.firestoreDatabaseId || process.env.FIREBASE_DATABASE_ID;

const app = getApps().length
  ? getApps()[0]
  : initializeApp(projectId ? { projectId } : undefined);

export const adminAuth = getAuth(app);
export const adminDb = firestoreDatabaseId
  ? getFirestore(app, firestoreDatabaseId)
  : getFirestore(app);
