/* lib/telegramClient.ts */
export async function notifyTelegram(agentId:string, payload:{
  type:"newBooking"|"updateBooking"|"payout",
  data:any
}){
  try{
    await fetch("/api/telegram/notify",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ agentId, ...payload })
    });
  }catch(e){ console.error("tg notify err",e); }
}