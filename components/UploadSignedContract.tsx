import { useState } from "react";
import { useTranslation } from "next-i18next";

export default function UploadSignedContract({ userId, lastLink }:{
  userId:string; lastLink?:string|null;
}){
  const { t } = useTranslation("common");
  const [file,setFile] = useState<File|null>(null);
  const [loading,setLoad]=useState(false);
  const [link,setLink] = useState<string|null>(lastLink??null);

  async function send(){
    if(!file) return;
    setLoad(true);
    const fd=new FormData();
    fd.append("userId",userId);
    fd.append("file",file);
    const r=await fetch("/api/upload-signed-contract",{method:"POST",body:fd});
    const j=await r.json();
    setLoad(false);
    if(r.ok&&j.link) setLink(j.link);
    else alert(j.error||"Upload error");
  }

  return (
    <div className="space-y-2">
      {link ? (
        <p className="text-green-700 text-sm">
          ✓ {t("signedUploaded")} —{" "}
          <a href={link} target="_blank" className="underline">{t("view")}</a>
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <input type="file" accept="application/pdf"
                 onChange={e=>setFile(e.target.files?.[0]||null)}/>
          <button onClick={send} disabled={!file||loading}
            className="px-4 py-1 bg-indigo-600 text-white rounded disabled:opacity-50">
            {loading ? t("uploading") : t("upload")}
          </button>
        </div>
      )}
    </div>
  );
}