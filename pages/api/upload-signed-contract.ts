import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";

/* helpers */
function cred(p:string,b:string){ if(process.env[p])return JSON.parse(process.env[p]!);
  if(process.env[b])return JSON.parse(Buffer.from(process.env[b]!, "base64").toString("utf8"));
  throw new Error(`${p} not set`);
}
const safeName=(s:string)=>s.replace(/[\\/:*?"<>|]/g,"_").trim();

/* Firebase */
if(!(global as any)._fbAdmin){ initializeApp({credential:cert(cred("FIREBASE_SERVICE_ACCOUNT_JSON","FIREBASE_SERVICE_ACCOUNT_JSON_BASE64"))});
  (global as any)._fbAdmin=true;}
const db=getFirestore();

/* Drive */
const drive=google.drive({
  version:"v3",
  auth:new google.auth.GoogleAuth({
    credentials:cred("GOOGLE_SERVICE_ACCOUNT_JSON","GOOGLE_SERVICE_ACCOUNT_JSON_BASE64"),
    scopes:["https://www.googleapis.com/auth/drive"],
  }),
});
const ROOT_FOLDER_ID=process.env.CONTRACTS_ROOT_FOLDER_ID!;

export const config={api:{bodyParser:false}};

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=="POST")return res.status(405).end();

  /* ➊ parse multipart */
  const { fields, files } = await new Promise<any>((ok,err)=>
    formidable().parse(req,(e,f,fl)=>e?err(e):ok({fields:f,files:fl})));

  const userId = Array.isArray(fields.userId)?fields.userId[0]:fields.userId;
  const file   = Array.isArray(files.file)?files.file[0]:files.file;

  if(!userId||!file) return res.status(400).json({error:"userId or file missing"});

  /* ➋ user data: agency + номер последнего контракта */
  const snap = await db.doc(`users/${userId}`).get();
  const data = snap.data() as any || {};
  const agency = safeName(data.agencyName || userId);
  const number = data.lastContract?.number;
  if(!number) return res.status(400).json({error:"No generated contract found"});

  /* ➌ find/create folder */
  const l = await drive.files.list({
    q:`'${ROOT_FOLDER_ID}' in parents and name='${agency}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields:"files(id)",
  });
  let folderId = l.data.files?.[0]?.id;
  if(!folderId){
    folderId=(await drive.files.create({
      requestBody:{ name:agency, mimeType:"application/vnd.google-apps.folder", parents:[ROOT_FOLDER_ID]},
      fields:"id"})).data.id!;
  }

  /* ➍ temp copy */
  const tmp = join(tmpdir(), file.originalFilename || "signed.pdf");
  await fs.promises.copyFile(file.filepath,tmp);

  /* ➎ upload as Signed-<№>.pdf */
  const up = await drive.files.create({
    requestBody:{ name:`Signed-${number}.pdf`, parents:[folderId]},
    media:{ mimeType:file.mimetype||"application/pdf", body: fs.createReadStream(tmp)},
    fields:"id",
  });
  await drive.permissions.create({ fileId:up.data.id!, requestBody:{role:"reader",type:"anyone"}});
  const link = `https://drive.google.com/uc?id=${up.data.id}&export=download`;

  /* ➏ Firestore update */
  await db.doc(`users/${userId}`).set({
    lastContract:{ ...data.lastContract, signedLink:link },
    signedContractLinks: FieldValue.arrayUnion(link),
    hasSignedContract : true,
  },{ merge:true });

  res.status(200).json({ link });
}