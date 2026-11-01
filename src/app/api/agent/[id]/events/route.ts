import { isSessionAlive, subscribeToSession } from "@/lib/dsh/sessions";
export async function GET(request: Request, {params}: {params: Promise<{id:string}>}) {
  const {id}=await params;
  if(!isSessionAlive(id))return Response.json({error:"Session not found"},{status:404});
  const encoder=new TextEncoder();
  let unsubscribe: (()=>void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const cleanup=()=>{unsubscribe?.();if(heartbeat)clearInterval(heartbeat);};
  const stream=new ReadableStream({
    start(controller) {
      const send=(event:unknown)=>{try{controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));}catch{cleanup();}};
      send({type:"connected"});
      unsubscribe=subscribeToSession(id,send);
      heartbeat=setInterval(()=>{try{controller.enqueue(encoder.encode(": heartbeat\n\n"));}catch{cleanup();}},15000);
      request.signal.addEventListener("abort",()=>{cleanup();try{controller.close();}catch{}},{once:true});
    },
    cancel(){cleanup();},
  });
  return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache, no-transform",Connection:"keep-alive"}});
}
