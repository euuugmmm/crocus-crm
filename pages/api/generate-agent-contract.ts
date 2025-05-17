// pages/api/generate-agent-contract.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { google, drive_v3 } from 'googleapis';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import fs, { readFileSync, existsSync, createReadStream } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { promisify } from 'util';
import stream from 'stream';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const pipeline = promisify(stream.pipeline);
export const config = { api: { bodyParser: true } };

let firestoreClient: FirebaseFirestore.Firestore;
let driveClient: drive_v3.Drive;
const ROOT_FOLDER_ID = process.env.CONTRACTS_ROOT_FOLDER_ID;

function initServices() {
  if ((globalThis as any)._contractsInited) return;

  // Initialize Firebase Admin
  let fbJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if (!fbJson && process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) {
    fbJson = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64,
      'base64'
    ).toString('utf8');
  }
  if (!fbJson) throw new Error('Env FIREBASE_SERVICE_ACCOUNT_JSON(_BASE64) not set');
  initializeApp({ credential: cert(JSON.parse(fbJson)) });
  firestoreClient = getFirestore();

  // Initialize Google Drive client
  let gJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  if (!gJson && process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) {
    gJson = Buffer.from(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64,
      'base64'
    ).toString('utf8');
  }
  if (!gJson) throw new Error('Env GOOGLE_SERVICE_ACCOUNT_JSON(_BASE64) not set');
  const googleCreds = JSON.parse(gJson);
  const auth = new google.auth.GoogleAuth({
    credentials: googleCreds,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  driveClient = google.drive({ version: 'v3', auth });

  if (!ROOT_FOLDER_ID) throw new Error('Env CONTRACTS_ROOT_FOLDER_ID not set');
  (globalThis as any)._contractsInited = true;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Only POST allowed');
  }

  try {
    initServices();

    // Destructure required fields
    const { agentName, agencyName, date } = req.body;
    const missing = ['agentName', 'agencyName', 'date'].filter(
      (key) => !req.body[key]
    );
    if (missing.length) {
      return res.status(400).json({ error: 'Missing required fields', missing });
    }

    // 1) Render DOCX template
    const templatePath = resolve(
      process.cwd(),
      'templates/agent-contract.docx'
    );
    if (!existsSync(templatePath)) {
      return res
        .status(500)
        .json({ error: 'Template file not found', path: templatePath });
    }
    const tplContent = readFileSync(templatePath, 'binary');
    const zip = new PizZip(tplContent);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
    });
    doc.render({ agentName, agencyName, date });
    const docBuffer = doc.getZip().generate({ type: 'nodebuffer' });

    // 2) Save DOCX to temp file
    const tmpDocxPath = join(tmpdir(), `contract-${Date.now()}.docx`);
    await fs.promises.writeFile(tmpDocxPath, docBuffer);

    // 3) Upload as Google Doc and convert to PDF
    const uploadDocRes = await driveClient.files.create({
      requestBody: {
        name: `contract-${Date.now()}.docx`,
        parents: [ROOT_FOLDER_ID!],
        mimeType: 'application/vnd.google-apps.document',
      },
      media: {
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        body: createReadStream(tmpDocxPath),
      },
      fields: 'id',
    });
    const gdocId = uploadDocRes.data.id!;

    // 4) Export to PDF stream
    const exportRes = await driveClient.files.export(
      { fileId: gdocId, mimeType: 'application/pdf' },
      { responseType: 'stream' }
    );
    const tmpPdfPath = join(tmpdir(), `contract-${Date.now()}.pdf`);
    await pipeline(exportRes.data as stream.Readable, fs.createWriteStream(tmpPdfPath));
    // Delete intermediate Google Doc
    await driveClient.files.delete({ fileId: gdocId });

    // 5) Find or create agency folder
    const folderQuery = `\`${ROOT_FOLDER_ID}\` in parents and name='${agencyName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    let folderId: string | undefined;
    const listRes = await driveClient.files.list({ q: folderQuery, fields: 'files(id)' });
    const files = listRes.data?.files ?? [];
    folderId = files.length > 0 ? files[0].id : undefined;
    if (!folderId) {
      const mk = await driveClient.files.create({
        requestBody: {
          name: agencyName,
          parents: [ROOT_FOLDER_ID!],
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      folderId = mk.data.id!;
    }

    // 6) Upload PDF
    const uploadPdfRes = await driveClient.files.create({
      requestBody: { name: `contract-${Date.now()}.pdf`, parents: [folderId] },
      media: { mimeType: 'application/pdf', body: createReadStream(tmpPdfPath) },
      fields: 'id',
    });
    const pdfFileId = uploadPdfRes.data.id!;
    await driveClient.permissions.create({
      fileId: pdfFileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    const link = `https://drive.google.com/uc?id=${pdfFileId}&export=download`;

    // 7) Save link to Firestore (non-blocking)
    try {
      await firestoreClient.collection('users').doc(agencyName).set({ contractLinks: FieldValue.arrayUnion(link) }, { merge: true });
    } catch (fw) {
      console.warn('Failed to save link to Firestore:', fw);
    }

    return res.status(200).json({ link });
  } catch (err: any) {
    console.error('Contract generation error:', err);
    return res.status(500).json({ error: err.message });
  }
}
